import {
  BroadcastRecipientStatus,
  BroadcastStatus,
  Prisma,
  WorkspaceRole,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplateMessage } from "@/server/whatsapp/client";
import { requireWorkspaceAccess } from "@/server/workspace-access";

export const broadcastJobType = "WHATSAPP_BROADCAST";
const batchSize = 10;

export function isMarketingContactEligible(contact: {
  phoneNumber: string;
  marketingOptInAt: Date | null;
  marketingOptOutAt: Date | null;
}) {
  return Boolean(
    contact.phoneNumber.trim() &&
      contact.marketingOptInAt &&
      (!contact.marketingOptOutAt || contact.marketingOptOutAt < contact.marketingOptInAt),
  );
}

export async function getBroadcastsPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const [campaigns, segments, optedInCount, whatsApp] = await Promise.all([
    prisma.broadcastCampaign.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { segment: { select: { id: true, name: true } } },
    }),
    prisma.customerSegment.findMany({
      where: { businessId: access.businessId },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: true } } },
    }),
    prisma.contact.count({
      where: { businessId: access.businessId, marketingOptInAt: { not: null }, marketingOptOutAt: null },
    }),
    prisma.whatsAppSettings.findUnique({ where: { businessId: access.businessId }, select: { isActive: true, phoneNumberId: true } }),
  ]);
  return { businessName: access.businessName, campaigns, segments, optedInCount, whatsAppReady: Boolean(whatsApp?.isActive && whatsApp.phoneNumberId) };
}

export async function createBroadcast(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const name = clean(formData.get("name"), 120);
  const templateName = clean(formData.get("templateName"), 512).toLowerCase();
  const languageCode = clean(formData.get("languageCode"), 12) || "id";
  if (!name || !/^[a-z0-9_]{1,512}$/.test(templateName)) {
    throw new Error("Nama campaign dan nama template Meta yang valid wajib diisi.");
  }
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(languageCode)) throw new Error("Kode bahasa template tidak valid.");
  const segmentId = clean(formData.get("segmentId"), 64) || null;
  if (segmentId) {
    const segment = await prisma.customerSegment.findFirst({ where: { id: segmentId, businessId: access.businessId }, select: { id: true } });
    if (!segment) throw new Error("Segmen campaign tidak ditemukan.");
  }
  const bodyParameters = clean(formData.get("bodyParameters"), 10_000)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  return prisma.broadcastCampaign.create({
    data: {
      businessId: access.businessId,
      segmentId,
      name,
      templateName,
      languageCode,
      bodyParameters: bodyParameters as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function startBroadcast(userId: string, campaignId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const campaign = await prisma.broadcastCampaign.findFirst({ where: { id: campaignId, businessId: access.businessId } });
  if (!campaign) throw new Error("Campaign tidak ditemukan.");
  const restartableStatuses: BroadcastStatus[] = [
    BroadcastStatus.DRAFT,
    BroadcastStatus.PAUSED,
    BroadcastStatus.FAILED,
  ];
  if (!restartableStatuses.includes(campaign.status)) {
    throw new Error("Campaign ini sudah berjalan atau selesai.");
  }
  const whatsApp = await prisma.whatsAppSettings.findUnique({ where: { businessId: access.businessId }, select: { isActive: true, phoneNumberId: true } });
  if (!whatsApp?.isActive || !whatsApp.phoneNumberId) throw new Error("Hubungkan WhatsApp Cloud API sebelum memulai broadcast.");
  const contacts = await prisma.contact.findMany({
    where: {
      businessId: access.businessId,
      marketingOptInAt: { not: null },
      marketingOptOutAt: null,
      ...(campaign.segmentId ? { segmentMemberships: { some: { segmentId: campaign.segmentId } } } : {}),
    },
    select: { id: true, phoneNumber: true, marketingOptInAt: true, marketingOptOutAt: true },
  });
  const eligible = contacts.filter(isMarketingContactEligible);
  if (eligible.length === 0) throw new Error("Tidak ada penerima yang sudah memberikan opt-in WhatsApp.");
  await prisma.$transaction([
    prisma.broadcastRecipient.createMany({
      data: eligible.map((contact) => ({ campaignId, contactId: contact.id, phoneNumber: contact.phoneNumber })),
      skipDuplicates: true,
    }),
    prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: { status: BroadcastStatus.RUNNING, startedAt: new Date(), completedAt: null, totalRecipients: eligible.length, failedCount: 0 },
    }),
    prisma.backgroundJob.create({
      data: {
        businessId: access.businessId,
        type: broadcastJobType,
        dedupeKey: `broadcast:${campaignId}:${crypto.randomUUID()}`,
        payload: { campaignId },
        runAfter: new Date(),
      },
    }),
  ]);
}

export async function pauseBroadcast(userId: string, campaignId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await prisma.broadcastCampaign.updateMany({
    where: { id: campaignId, businessId: access.businessId, status: BroadcastStatus.RUNNING },
    data: { status: BroadcastStatus.PAUSED },
  });
}

export async function processBroadcastJob(businessId: string, payload: Prisma.JsonValue) {
  const campaignId = jsonString(payload, "campaignId");
  if (!campaignId) throw new Error("Campaign ID job tidak valid.");
  const campaign = await prisma.broadcastCampaign.findFirst({ where: { id: campaignId, businessId } });
  if (!campaign || campaign.status !== BroadcastStatus.RUNNING) return;
  const recipients = await prisma.broadcastRecipient.findMany({
    where: { campaignId, status: BroadcastRecipientStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    include: { contact: { select: { marketingOptInAt: true, marketingOptOutAt: true } } },
  });
  const parameters = Array.isArray(campaign.bodyParameters)
    ? campaign.bodyParameters.filter((value): value is string => typeof value === "string")
    : [];
  for (const recipient of recipients) {
    if (!isMarketingContactEligible({ phoneNumber: recipient.phoneNumber, ...recipient.contact })) {
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "marketing_consent_missing" } });
      continue;
    }
    const delivery = await sendWhatsAppTemplateMessage({
      businessId,
      to: recipient.phoneNumber,
      templateName: campaign.templateName,
      languageCode: campaign.languageCode,
      bodyParameters: parameters,
    });
    await prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data: delivery.sent
        ? { status: BroadcastRecipientStatus.SENT, providerMessageId: delivery.providerMessageId, sentAt: new Date(), errorCode: null }
        : { status: BroadcastRecipientStatus.FAILED, errorCode: delivery.reason },
    });
  }
  const [pending, sent, failed] = await Promise.all([
    prisma.broadcastRecipient.count({ where: { campaignId, status: BroadcastRecipientStatus.PENDING } }),
    prisma.broadcastRecipient.count({ where: { campaignId, status: { in: [BroadcastRecipientStatus.SENT, BroadcastRecipientStatus.DELIVERED, BroadcastRecipientStatus.READ] } } }),
    prisma.broadcastRecipient.count({ where: { campaignId, status: BroadcastRecipientStatus.FAILED } }),
  ]);
  if (pending === 0) {
    await prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { status: BroadcastStatus.COMPLETED, completedAt: new Date(), sentCount: sent, failedCount: failed } });
    return;
  }
  await prisma.$transaction([
    prisma.broadcastCampaign.update({ where: { id: campaignId }, data: { sentCount: sent, failedCount: failed } }),
    prisma.backgroundJob.create({
      data: {
        businessId,
        type: broadcastJobType,
        dedupeKey: `broadcast:${campaignId}:${crypto.randomUUID()}`,
        payload: { campaignId },
        runAfter: new Date(Date.now() + 5_000),
      },
    }),
  ]);
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function jsonString(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}
