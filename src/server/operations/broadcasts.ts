import {
  BroadcastRecipientStatus,
  BroadcastStatus,
  Prisma,
  WorkspaceRole,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplateMessage } from "@/server/whatsapp/client";
import { normalizeWhatsAppPhone } from "@/server/whatsapp/phone";
import {
  listApprovedMetaWhatsAppTemplateOptions,
  requireApprovedMetaWhatsAppTemplate,
} from "@/server/whatsapp/templates";
import { requireWorkspaceAccess } from "@/server/workspace-access";
import { assertWorkspaceFeature, getWorkspaceEntitlements } from "@/server/subscriptions/subscriptions";

export const broadcastJobType = "WHATSAPP_BROADCAST";
const batchSize = 10;
export const marketingCooldownMs = 7 * 24 * 60 * 60_000;
const metaThrottleErrorCodes = new Set(["80007", "130429", "131048", "131056"]);

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

export function isMarketingContactCooldownElapsed(lastContactedAt: Date | null, now = new Date()) {
  return !lastContactedAt || now.getTime() - lastContactedAt.getTime() >= marketingCooldownMs;
}

export function isMarketingContactSendable(contact: {
  phoneNumber: string;
  marketingOptInAt: Date | null;
  marketingOptOutAt: Date | null;
  lastContactedAt: Date | null;
}, now = new Date()) {
  return isMarketingContactEligible(contact) && isMarketingContactCooldownElapsed(contact.lastContactedAt, now);
}

export function isMetaBroadcastThrottleError(errorCode: string | null | undefined) {
  return Boolean(errorCode && metaThrottleErrorCodes.has(errorCode));
}

export async function getBroadcastsPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const [campaigns, segments, optedInCount, whatsApp, approvedTemplates] = await Promise.all([
    prisma.broadcastCampaign.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        segment: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
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
    listApprovedMetaWhatsAppTemplateOptions(access.businessId),
  ]);
  return {
    businessName: access.businessName,
    campaigns,
    segments,
    optedInCount,
    whatsAppReady: Boolean(whatsApp?.isActive && whatsApp.phoneNumberId),
    templates: approvedTemplates.templates,
    templateError: approvedTemplates.error,
  };
}

export async function createBroadcast(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await assertWorkspaceFeature(access.businessId, "BROADCAST");
  const name = clean(formData.get("name"), 120);
  const { templateName, languageCode } = parseApprovedTemplateKey(formData);
  await requireApprovedMetaWhatsAppTemplate(access.businessId, templateName, languageCode);
  if (!name) throw new Error("Nama campaign wajib diisi.");
  const phoneNumbers = parseManualPhoneNumbers(formData.get("phoneNumbers"));
  if (phoneNumbers.length === 0) throw new Error("Isi minimal satu nomor WhatsApp.");
  const contacts = await prisma.contact.findMany({
    where: { businessId: access.businessId },
    select: { id: true, phoneNumber: true, marketingOptInAt: true, marketingOptOutAt: true, lastContactedAt: true },
  });
  const eligibleContacts = new Map(
    contacts
      .filter(isMarketingContactEligible)
      .map((contact) => [normalizeBroadcastPhone(contact.phoneNumber), contact] as const)
      .filter(([phoneNumber]) => Boolean(phoneNumber)),
  );
  const missingNumbers = phoneNumbers.filter((phoneNumber) => !eligibleContacts.has(phoneNumber));
  if (missingNumbers.length > 0) {
    const sample = missingNumbers.slice(0, 3).join(", ");
    const suffix = missingNumbers.length > 3 ? ` dan ${missingNumbers.length - 3} nomor lainnya` : "";
    throw new Error(`Nomor ${sample}${suffix} belum tercatat sebagai kontak dengan opt-in marketing.`);
  }
  const bodyParameters = clean(formData.get("bodyParameters"), 10_000)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
  return prisma.$transaction(async (tx) => {
    const campaign = await tx.broadcastCampaign.create({
      data: {
        businessId: access.businessId,
        name,
        templateName,
        languageCode,
        bodyParameters: bodyParameters as unknown as Prisma.InputJsonValue,
      },
    });
    await tx.broadcastRecipient.createMany({
      data: phoneNumbers.map((phoneNumber) => ({
        campaignId: campaign.id,
        contactId: eligibleContacts.get(phoneNumber)!.id,
        phoneNumber,
      })),
    });
    return campaign;
  });
}

export async function startBroadcast(userId: string, campaignId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await assertWorkspaceFeature(access.businessId, "BROADCAST");
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
  const manualRecipients = await prisma.broadcastRecipient.findMany({
    where: {
      campaignId,
      status: {
        in: [
          BroadcastRecipientStatus.PENDING,
          BroadcastRecipientStatus.FAILED,
          BroadcastRecipientStatus.SKIPPED,
        ],
      },
    },
    select: {
      id: true,
      phoneNumber: true,
      contact: { select: { marketingOptInAt: true, marketingOptOutAt: true, lastContactedAt: true } },
    },
  });

  if (manualRecipients.length > 0) {
    const eligible = manualRecipients.filter((recipient) =>
      isMarketingContactSendable({ phoneNumber: recipient.phoneNumber, ...recipient.contact }),
    );
    if (eligible.length === 0) throw new Error("Tidak ada nomor manual yang siap dikirim. Periksa consent dan cooldown promosi.");
    const eligibleIds = eligible.map((recipient) => recipient.id);
    const eligibleIdSet = new Set(eligibleIds);
    const ineligibleIds = manualRecipients
      .filter((recipient) => !eligibleIdSet.has(recipient.id))
      .map((recipient) => recipient.id);

    await prisma.$transaction(async (tx) => {
      if (ineligibleIds.length > 0) {
        await tx.broadcastRecipient.updateMany({
          where: { campaignId, id: { in: ineligibleIds } },
          data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "marketing_recipient_not_ready" },
        });
      }
      await tx.broadcastRecipient.updateMany({
        where: { campaignId, id: { in: eligibleIds }, status: { in: [BroadcastRecipientStatus.PENDING, BroadcastRecipientStatus.FAILED] } },
        data: { status: BroadcastRecipientStatus.PENDING, providerMessageId: null, errorCode: null, sentAt: null },
      });
      await tx.broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: BroadcastStatus.RUNNING, startedAt: new Date(), completedAt: null, totalRecipients: eligible.length, failedCount: 0 },
      });
      await tx.backgroundJob.create({
        data: {
          businessId: access.businessId,
          type: broadcastJobType,
          dedupeKey: `broadcast:${campaignId}:${crypto.randomUUID()}`,
          payload: { campaignId },
          runAfter: new Date(),
        },
      });
    });
    return;
  }

  const contacts = await prisma.contact.findMany({
    where: {
      businessId: access.businessId,
      marketingOptInAt: { not: null },
      marketingOptOutAt: null,
      ...(campaign.segmentId ? { segmentMemberships: { some: { segmentId: campaign.segmentId } } } : {}),
    },
    select: { id: true, phoneNumber: true, marketingOptInAt: true, marketingOptOutAt: true, lastContactedAt: true },
  });
  const eligible = contacts.filter((contact) => isMarketingContactSendable(contact));
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
  await assertWorkspaceFeature(access.businessId, "BROADCAST");
  await prisma.broadcastCampaign.updateMany({
    where: { id: campaignId, businessId: access.businessId, status: BroadcastStatus.RUNNING },
    data: { status: BroadcastStatus.PAUSED },
  });
}

export async function processBroadcastJob(businessId: string, payload: Prisma.JsonValue) {
  const entitlements = await getWorkspaceEntitlements(businessId);
  if (!entitlements.accessActive || !entitlements.features.includes("BROADCAST")) return;
  const campaignId = jsonString(payload, "campaignId");
  if (!campaignId) throw new Error("Campaign ID job tidak valid.");
  const campaign = await prisma.broadcastCampaign.findFirst({ where: { id: campaignId, businessId } });
  if (!campaign || campaign.status !== BroadcastStatus.RUNNING) return;
  const recipients = await prisma.broadcastRecipient.findMany({
    where: { campaignId, status: BroadcastRecipientStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: batchSize,
    include: { contact: { select: { marketingOptInAt: true, marketingOptOutAt: true, lastContactedAt: true } } },
  });
  const parameters = Array.isArray(campaign.bodyParameters)
    ? campaign.bodyParameters.filter((value): value is string => typeof value === "string")
    : [];
  let throttledByMeta = false;
  for (const recipient of recipients) {
    const contact = { phoneNumber: recipient.phoneNumber, ...recipient.contact };
    if (!isMarketingContactEligible(contact)) {
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "marketing_consent_missing" } });
      continue;
    }
    if (!isMarketingContactCooldownElapsed(contact.lastContactedAt)) {
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "marketing_cooldown_active" } });
      continue;
    }

    const claimed = await prisma.contact.updateMany({
      where: {
        id: recipient.contactId,
        marketingOptInAt: { not: null },
        marketingOptOutAt: null,
        lastContactedAt: contact.lastContactedAt,
      },
      data: { lastContactedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "marketing_recipient_changed" } });
      continue;
    }

    const delivery = await sendWhatsAppTemplateMessage({
      businessId,
      to: recipient.phoneNumber,
      templateName: campaign.templateName,
      languageCode: campaign.languageCode,
      bodyParameters: parameters,
    });
    const failureCode = delivery.providerErrorCode ?? delivery.reason;
    await prisma.broadcastRecipient.update({
      where: { id: recipient.id },
      data: delivery.sent
        ? { status: BroadcastRecipientStatus.SENT, providerMessageId: delivery.providerMessageId, sentAt: new Date(), errorCode: null }
        : { status: BroadcastRecipientStatus.FAILED, errorCode: failureCode },
    });
    if (!delivery.sent && isMetaBroadcastThrottleError(delivery.providerErrorCode)) {
      throttledByMeta = true;
      break;
    }
  }
  const [pending, sent, failed] = await Promise.all([
    prisma.broadcastRecipient.count({ where: { campaignId, status: BroadcastRecipientStatus.PENDING } }),
    prisma.broadcastRecipient.count({ where: { campaignId, status: { in: [BroadcastRecipientStatus.SENT, BroadcastRecipientStatus.DELIVERED, BroadcastRecipientStatus.READ] } } }),
    prisma.broadcastRecipient.count({ where: { campaignId, status: BroadcastRecipientStatus.FAILED } }),
  ]);
  if (throttledByMeta) {
    await prisma.broadcastCampaign.update({
      where: { id: campaignId },
      data: { status: BroadcastStatus.PAUSED, sentCount: sent, failedCount: failed },
    });
    return;
  }
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

function parseApprovedTemplateKey(formData: FormData) {
  const templateKey = clean(formData.get("templateKey"), 600);
  const separatorIndex = templateKey.indexOf("::");
  const templateName = separatorIndex >= 0 ? templateKey.slice(0, separatorIndex) : "";
  const languageCode = separatorIndex >= 0 ? templateKey.slice(separatorIndex + 2) : "";
  if (!templateName || !languageCode) {
    throw new Error("Pilih template WhatsApp yang sudah disetujui Meta.");
  }
  return { templateName, languageCode };
}

function parseManualPhoneNumbers(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];
  const numbers = value
    .split(/[\r\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (numbers.length > 500) throw new Error("Broadcast dibatasi maksimal 500 nomor per campaign.");

  const normalized = numbers.map((item) => normalizeBroadcastPhone(item));
  const invalidIndex = normalized.findIndex((item) => item === null);
  if (invalidIndex >= 0) {
    const invalidInput = numbers[invalidIndex] ?? "";
    throw new Error(`Nomor WhatsApp tidak valid: ${invalidInput}. Contoh format: 08xxxx, 62812xxxxxxx, atau +62 812xxxxxxx.`);
  }
  return [...new Set(normalized.filter((item): item is string => Boolean(item)))];
}

function normalizeBroadcastPhone(value: string) {
  const normalized = normalizeWhatsAppPhone(value);
  return /^\d{7,15}$/.test(normalized) ? normalized : null;
}

function jsonString(value: Prisma.JsonValue, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}
