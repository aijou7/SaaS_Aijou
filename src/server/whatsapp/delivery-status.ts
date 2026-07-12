import {
  Prisma,
  ProcessingStatus,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  extractDeliveryStatuses,
  type WhatsAppDeliveryStatus,
  type WhatsAppWebhookPayload,
} from "@/server/whatsapp/payload";

const successRank: Record<string, number> = {
  PENDING: 0,
  SENDING: 1,
  UNKNOWN: 1,
  ACCEPTED: 2,
  DELIVERED: 3,
  READ: 4,
};

type NormalizedDelivery = {
  providerMessageId: string;
  deliveryStatus: "ACCEPTED" | "DELIVERED" | "READ" | "FAILED";
  deliveryError: string | null;
  deliveryTime: Date;
};

type DeliveryUpdate = {
  id: string;
  deliveryStatus: string;
  deliveryError: string | null;
  deliveredAt: Date | null;
  processingStatus: ProcessingStatus;
};

export async function applyWhatsAppDeliveryStatuses(
  payload: WhatsAppWebhookPayload,
  businessId: string,
) {
  const statuses = extractDeliveryStatuses(payload);
  const normalized = statuses
    .map(normalizeDelivery)
    .filter((item): item is NormalizedDelivery => Boolean(item));
  const eventsByProviderId = new Map<string, NormalizedDelivery[]>();

  for (const event of normalized) {
    const events = eventsByProviderId.get(event.providerMessageId) ?? [];
    events.push(event);
    eventsByProviderId.set(event.providerMessageId, events);
  }

  const messages = [] as Array<{
    id: string;
    providerMessageId: string;
    deliveryStatus: string;
    deliveryError: string | null;
    deliveredAt: Date | null;
    processingStatus: ProcessingStatus;
  }>;
  const providerIds = [...eventsByProviderId.keys()];

  for (const ids of chunk(providerIds, 500)) {
    messages.push(
      ...(await prisma.whatsAppMessage.findMany({
        where: {
          providerMessageId: { in: ids },
          conversation: { businessId },
        },
        select: {
          id: true,
          providerMessageId: true,
          deliveryStatus: true,
          deliveryError: true,
          deliveredAt: true,
          processingStatus: true,
        },
      })),
    );
  }

  const updates: DeliveryUpdate[] = [];
  for (const message of messages) {
    const events = eventsByProviderId.get(message.providerMessageId) ?? [];
    let deliveryStatus = message.deliveryStatus;
    let deliveryError = message.deliveryError;
    let deliveredAt = message.deliveredAt;
    let changed = false;

    for (const event of events) {
      if (!shouldApplyTransition(deliveryStatus, event.deliveryStatus)) continue;
      deliveryStatus = event.deliveryStatus;
      deliveryError = event.deliveryError;
      if ((deliveryStatus === "DELIVERED" || deliveryStatus === "READ") && !deliveredAt) {
        deliveredAt = event.deliveryTime;
      }
      changed = true;
    }

    if (!changed) continue;
    updates.push({
      id: message.id,
      deliveryStatus,
      deliveryError,
      deliveredAt,
      processingStatus:
        deliveryStatus === "FAILED"
          ? ProcessingStatus.FAILED
          : ProcessingStatus.PROCESSED,
    });
  }

  let updated = 0;
  for (const batch of chunk(updates, 250)) {
    const rows = batch.map(
      (item) => Prisma.sql`(
        ${item.id}::text,
        ${item.deliveryStatus}::text,
        ${item.deliveryError}::text,
        ${item.deliveredAt}::timestamp(3),
        ${item.processingStatus}::"ProcessingStatus"
      )`,
    );
    const count = await prisma.$executeRaw(Prisma.sql`
      UPDATE "whatsapp_messages" AS message
      SET
        "deliveryStatus" = incoming."deliveryStatus",
        "deliveryError" = incoming."deliveryError",
        "deliveredAt" = COALESCE(message."deliveredAt", incoming."deliveredAt"),
        "processingStatus" = incoming."processingStatus"
      FROM (VALUES ${Prisma.join(rows)}) AS incoming(
        "id",
        "deliveryStatus",
        "deliveryError",
        "deliveredAt",
        "processingStatus"
      )
      WHERE message."id" = incoming."id"
        AND (
          (
            incoming."deliveryStatus" = 'FAILED'
            AND message."deliveryStatus" NOT IN ('DELIVERED', 'READ', 'FAILED')
          )
          OR (
            incoming."deliveryStatus" <> 'FAILED'
            AND message."deliveryStatus" <> 'FAILED'
            AND CASE incoming."deliveryStatus"
              WHEN 'READ' THEN 4
              WHEN 'DELIVERED' THEN 3
              WHEN 'ACCEPTED' THEN 2
              ELSE 0
            END >= CASE message."deliveryStatus"
              WHEN 'READ' THEN 4
              WHEN 'DELIVERED' THEN 3
              WHEN 'ACCEPTED' THEN 2
              WHEN 'SENDING' THEN 1
              WHEN 'UNKNOWN' THEN 1
              ELSE 0
            END
          )
        )
    `);
    updated += Number(count);
  }

  return {
    received: statuses.length,
    recognized: normalized.length,
    matched: messages.length,
    updated,
  };
}

function normalizeDelivery(item: WhatsAppDeliveryStatus): NormalizedDelivery | null {
  const providerMessageId = item.id?.trim();
  const deliveryStatus = normalizeStatus(item.status);
  if (!providerMessageId || providerMessageId.length > 200 || !deliveryStatus) return null;

  return {
    providerMessageId,
    deliveryStatus,
    deliveryError: deliveryStatus === "FAILED" ? formatErrors(item.errors) : null,
    deliveryTime: parseProviderTimestamp(item.timestamp) ?? new Date(),
  };
}

function shouldApplyTransition(current: string, next: NormalizedDelivery["deliveryStatus"]) {
  if (current === "FAILED") return next === "FAILED";
  if (next === "FAILED") return current !== "DELIVERED" && current !== "READ";
  return (successRank[next] ?? 0) >= (successRank[current] ?? 0);
}

function normalizeStatus(value?: string) {
  if (value === "sent") return "ACCEPTED" as const;
  if (value === "delivered") return "DELIVERED" as const;
  if (value === "read") return "READ" as const;
  if (value === "failed") return "FAILED" as const;
  return null;
}

function parseProviderTimestamp(value?: string) {
  if (!value || !/^\d{1,13}$/.test(value)) return null;
  const numeric = Number(value);
  const millis = value.length <= 10 ? numeric * 1_000 : numeric;
  const date = new Date(millis);
  const earliest = Date.UTC(2000, 0, 1);
  const latest = Date.now() + 24 * 60 * 60_000;
  return Number.isNaN(date.getTime()) || date.getTime() < earliest || date.getTime() > latest
    ? null
    : date;
}

function formatErrors(errors?: Array<{ code?: number; title?: string; message?: string }>) {
  if (!errors?.length) return "WhatsApp delivery failed.";
  return errors
    .slice(0, 3)
    .map((error) => [error.code, error.title, error.message].filter(Boolean).join(": "))
    .join(" | ")
    .slice(0, 1_000);
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
