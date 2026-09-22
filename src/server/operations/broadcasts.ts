import {
  BroadcastKind,
  BroadcastRecipientStatus,
  BroadcastStatus,
  ConversationStatus,
  MessageType,
  Prisma,
  ProcessingStatus,
  SenderType,
  WorkspaceRole,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from "@/server/whatsapp/client";
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
export const consentRequestWindowMs = 24 * 60 * 60_000;
export const consentRequestCooldownMs = 30 * 24 * 60 * 60_000;
export const marketingConsentRequestBody = "Halo! Boleh kami mengirim info dan promo lewat WhatsApp? Balas YA PROMO untuk setuju atau TIDAK PROMO untuk menolak. Balas STOP kapan saja untuk berhenti.";
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

export function isConsentRequestEligible(contact: {
  phoneNumber: string;
  marketingOptInAt: Date | null;
  marketingOptOutAt: Date | null;
  marketingConsentPendingAt: Date | null;
  lastCustomerMessageAt: Date | null;
}, now = new Date()) {
  return Boolean(
    contact.phoneNumber.trim() &&
      !contact.marketingOptInAt &&
      !contact.marketingOptOutAt &&
      (!contact.marketingConsentPendingAt || now.getTime() - contact.marketingConsentPendingAt.getTime() >= consentRequestCooldownMs) &&
      contact.lastCustomerMessageAt &&
      now.getTime() - contact.lastCustomerMessageAt.getTime() < consentRequestWindowMs,
  );
}

export function isMetaBroadcastThrottleError(errorCode: string | null | undefined) {
  return Boolean(errorCode && metaThrottleErrorCodes.has(errorCode));
}

export function parseBroadcastAudience(value: FormDataEntryValue | null) {
  if (value === "all_opt_in") return "all_opt_in" as const;
  if (value === "recent_chat_consent") return "recent_chat_consent" as const;
  return "manual" as const;
}

export function shouldReactivateBroadcastConversation(
  status: ConversationStatus | string,
  latestSystemIntent?: string | null,
) {
  return status === ConversationStatus.HUMAN_NEEDED && latestSystemIntent !== "human_takeover_enabled";
}

export async function getBroadcastsPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const recentChatSince = new Date(Date.now() - consentRequestWindowMs);
  const consentRequestSince = new Date(Date.now() - consentRequestCooldownMs);
  const [campaigns, segments, optedInCount, recentChatCount, whatsApp, approvedTemplates] = await Promise.all([
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
    prisma.contact.count({
      where: {
        businessId: access.businessId,
        marketingOptInAt: null,
        marketingOptOutAt: null,
        OR: [{ marketingConsentPendingAt: null }, { marketingConsentPendingAt: { lt: consentRequestSince } }],
        conversations: { some: { channel: "WHATSAPP", lastCustomerMessageAt: { gte: recentChatSince } } },
      },
    }),
    prisma.whatsAppSettings.findUnique({ where: { businessId: access.businessId }, select: { isActive: true, phoneNumberId: true } }),
    listApprovedMetaWhatsAppTemplateOptions(access.businessId),
  ]);
  return {
    businessName: access.businessName,
    campaigns,
    segments,
    optedInCount,
    recentChatCount,
    whatsAppReady: Boolean(whatsApp?.isActive && whatsApp.phoneNumberId),
    templates: approvedTemplates.templates,
    templateError: approvedTemplates.error,
  };
}

export async function createBroadcast(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await assertWorkspaceFeature(access.businessId, "BROADCAST");
  const name = clean(formData.get("name"), 120);
  if (!name) throw new Error("Nama campaign wajib diisi.");
  const audience = parseBroadcastAudience(formData.get("audience"));
  const kind = audience === "recent_chat_consent" ? BroadcastKind.CONSENT_REQUEST : BroadcastKind.MARKETING;
  let templateName = "consent_request";
  let languageCode = "id";
  if (kind === BroadcastKind.MARKETING) {
    const approvedTemplate = parseApprovedTemplateKey(formData);
    templateName = approvedTemplate.templateName;
    languageCode = approvedTemplate.languageCode;
    await requireApprovedMetaWhatsAppTemplate(access.businessId, templateName, languageCode);
  }
  let phoneNumbers: string[] = [];
  let eligibleContacts = new Map<string, { id: string }>();

  if (audience === "manual") {
    phoneNumbers = parseManualPhoneNumbers(formData.get("phoneNumbers"));
    if (phoneNumbers.length === 0) throw new Error("Isi minimal satu nomor WhatsApp atau pilih semua kontak opt-in.");
    const contacts = await prisma.contact.findMany({
      where: { businessId: access.businessId },
      select: { id: true, phoneNumber: true, marketingOptInAt: true, marketingOptOutAt: true, lastContactedAt: true },
    });
    eligibleContacts = new Map();
    for (const contact of contacts) {
      if (!isMarketingContactEligible(contact)) continue;
      const phoneNumber = normalizeBroadcastPhone(contact.phoneNumber);
      if (phoneNumber) eligibleContacts.set(phoneNumber, contact);
    }
    const missingNumbers = phoneNumbers.filter((phoneNumber) => !eligibleContacts.has(phoneNumber));
    if (missingNumbers.length > 0) {
      const sample = missingNumbers.slice(0, 3).join(", ");
      const suffix = missingNumbers.length > 3 ? ` dan ${missingNumbers.length - 3} nomor lainnya` : "";
      throw new Error(`Nomor ${sample}${suffix} belum tercatat sebagai kontak dengan opt-in marketing.`);
    }
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
        kind,
        templateName,
        languageCode,
        bodyParameters: bodyParameters as unknown as Prisma.InputJsonValue,
        consentMessage: kind === BroadcastKind.CONSENT_REQUEST ? marketingConsentRequestBody : null,
      },
    });
    if (audience === "manual") {
      await tx.broadcastRecipient.createMany({
        data: phoneNumbers.map((phoneNumber) => ({
          campaignId: campaign.id,
          contactId: eligibleContacts.get(phoneNumber)!.id,
          phoneNumber,
        })),
      });
    }
    return campaign;
  });
}

async function findConsentRequestContacts(businessId: string, now: Date) {
  const contacts = await prisma.contact.findMany({
    where: {
      businessId,
      marketingOptInAt: null,
      marketingOptOutAt: null,
      OR: [{ marketingConsentPendingAt: null }, { marketingConsentPendingAt: { lt: new Date(now.getTime() - consentRequestCooldownMs) } }],
      conversations: { some: { channel: "WHATSAPP", lastCustomerMessageAt: { gte: new Date(now.getTime() - consentRequestWindowMs) } } },
    },
    select: {
      id: true,
      phoneNumber: true,
      marketingOptInAt: true,
      marketingOptOutAt: true,
      marketingConsentPendingAt: true,
      conversations: {
        where: { channel: "WHATSAPP", lastCustomerMessageAt: { not: null } },
        orderBy: { lastCustomerMessageAt: "desc" },
        take: 1,
        select: { lastCustomerMessageAt: true },
      },
    },
  });
  return contacts.map((contact) => ({
    recipientId: null,
    contactId: contact.id,
    phoneNumber: contact.phoneNumber,
    contact: {
      phoneNumber: contact.phoneNumber,
      marketingOptInAt: contact.marketingOptInAt,
      marketingOptOutAt: contact.marketingOptOutAt,
      marketingConsentPendingAt: contact.marketingConsentPendingAt,
      lastCustomerMessageAt: contact.conversations[0]?.lastCustomerMessageAt ?? null,
    },
  }));
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
  if (campaign.kind === BroadcastKind.CONSENT_REQUEST) {
    const now = new Date();
    const existingRecipients = await prisma.broadcastRecipient.findMany({
      where: {
        campaignId,
        status: { in: [BroadcastRecipientStatus.PENDING, BroadcastRecipientStatus.FAILED, BroadcastRecipientStatus.SKIPPED] },
      },
      select: {
        id: true,
        phoneNumber: true,
        contact: {
          select: {
            id: true,
            phoneNumber: true,
            marketingOptInAt: true,
            marketingOptOutAt: true,
            marketingConsentPendingAt: true,
            conversations: {
              where: { channel: "WHATSAPP", lastCustomerMessageAt: { not: null } },
              orderBy: { lastCustomerMessageAt: "desc" },
              take: 1,
              select: { lastCustomerMessageAt: true },
            },
          },
        },
      },
    });
    const candidates = existingRecipients.length > 0
      ? existingRecipients.map((recipient) => ({
          recipientId: recipient.id,
          contactId: recipient.contact.id,
          phoneNumber: recipient.phoneNumber,
          contact: {
            phoneNumber: recipient.contact.phoneNumber,
            marketingOptInAt: recipient.contact.marketingOptInAt,
            marketingOptOutAt: recipient.contact.marketingOptOutAt,
            marketingConsentPendingAt: recipient.contact.marketingConsentPendingAt,
            lastCustomerMessageAt: recipient.contact.conversations[0]?.lastCustomerMessageAt ?? null,
          },
        }))
      : await findConsentRequestContacts(access.businessId, now);
    const eligible = candidates.filter((candidate) => isConsentRequestEligible(candidate.contact, now));
    if (eligible.length === 0) throw new Error("Tidak ada customer yang chat dalam 24 jam terakhir dan siap menerima permintaan izin.");
    const eligibleIds = new Set(eligible.map((candidate) => candidate.recipientId).filter((id): id is string => Boolean(id)));
    await prisma.$transaction(async (tx) => {
      const ineligibleIds = candidates
        .map((candidate) => candidate.recipientId)
        .filter((id): id is string => Boolean(id && !eligibleIds.has(id)));
      if (ineligibleIds.length > 0) {
        await tx.broadcastRecipient.updateMany({
          where: { campaignId, id: { in: ineligibleIds } },
          data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "consent_request_not_eligible" },
        });
      }
      if (existingRecipients.length === 0) {
        await tx.broadcastRecipient.createMany({
          data: eligible.map((candidate) => ({ campaignId, contactId: candidate.contactId, phoneNumber: candidate.phoneNumber })),
        });
      } else {
        await tx.broadcastRecipient.updateMany({
          where: { campaignId, id: { in: Array.from(eligibleIds) } },
          data: { status: BroadcastRecipientStatus.PENDING, providerMessageId: null, errorCode: null, sentAt: null },
        });
      }
      await tx.broadcastCampaign.update({
        where: { id: campaignId },
        data: { status: BroadcastStatus.RUNNING, startedAt: now, completedAt: null, totalRecipients: eligible.length, failedCount: 0 },
      });
      await tx.backgroundJob.create({
        data: { businessId: access.businessId, type: broadcastJobType, dedupeKey: `broadcast:${campaignId}:${crypto.randomUUID()}`, payload: { campaignId }, runAfter: now },
      });
    });
    return;
  }
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
    include: {
      contact: {
        select: {
          phoneNumber: true,
          marketingOptInAt: true,
          marketingOptOutAt: true,
          marketingConsentPendingAt: true,
          lastContactedAt: true,
          conversations: {
            where: { channel: "WHATSAPP", lastCustomerMessageAt: { not: null } },
            orderBy: { lastCustomerMessageAt: "desc" },
            take: 1,
            select: { id: true, lastCustomerMessageAt: true },
          },
        },
      },
    },
  });
  const parameters = Array.isArray(campaign.bodyParameters)
    ? campaign.bodyParameters.filter((value): value is string => typeof value === "string")
    : [];
  const approvedTemplate = campaign.kind === BroadcastKind.MARKETING
    ? await requireApprovedMetaWhatsAppTemplate(businessId, campaign.templateName, campaign.languageCode)
    : null;
  let throttledByMeta = false;
  for (const recipient of recipients) {
    const contact = recipient.contact;
    if (campaign.kind === BroadcastKind.CONSENT_REQUEST) {
      const latestCustomerMessageAt = recipient.contact.conversations[0]?.lastCustomerMessageAt ?? null;
      if (!isConsentRequestEligible({ ...contact, lastCustomerMessageAt: latestCustomerMessageAt })) {
        await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "consent_request_not_eligible" } });
        continue;
      }

      const requestedAt = new Date();
      const claimed = await prisma.contact.updateMany({
        where: {
          id: recipient.contactId,
          marketingOptInAt: null,
          marketingOptOutAt: null,
          marketingConsentPendingAt: contact.marketingConsentPendingAt,
        },
        data: { marketingConsentPendingAt: requestedAt },
      });
      if (claimed.count !== 1) {
        await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "consent_request_already_claimed" } });
        continue;
      }

      const consentBody = campaign.consentMessage || marketingConsentRequestBody;
      const delivery = await sendWhatsAppTextMessage({ businessId, to: recipient.phoneNumber, body: consentBody });
      const failureCode = "providerErrorCode" in delivery ? delivery.providerErrorCode ?? delivery.reason : delivery.reason;
      await prisma.broadcastRecipient.update({
        where: { id: recipient.id },
        data: delivery.sent
          ? { status: BroadcastRecipientStatus.SENT, providerMessageId: delivery.providerMessageId, sentAt: new Date(), errorCode: null }
          : { status: BroadcastRecipientStatus.FAILED, errorCode: failureCode },
      });
      if (!delivery.sent) {
        await prisma.contact.updateMany({ where: { id: recipient.contactId, marketingConsentPendingAt: requestedAt }, data: { marketingConsentPendingAt: null } });
        continue;
      }
      await storeConsentRequestMessage({
        businessId,
        contactId: recipient.contactId,
        conversationId: recipient.contact.conversations[0]?.id,
        providerMessageId: delivery.providerMessageId,
        body: consentBody,
      });
      continue;
    }
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
        marketingOptOutAt: contact.marketingOptOutAt,
        lastContactedAt: contact.lastContactedAt,
      },
      data: { lastContactedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await prisma.broadcastRecipient.update({ where: { id: recipient.id }, data: { status: BroadcastRecipientStatus.SKIPPED, errorCode: "marketing_recipient_changed" } });
      continue;
    }

    const broadcastSentAt = new Date();
    const delivery = await sendWhatsAppTemplateMessage({
      businessId,
      to: recipient.phoneNumber,
      templateName: campaign.templateName,
      languageCode: campaign.languageCode,
      bodyParameters: parameters,
      headerImageUrl: approvedTemplate?.headerImageUrl ?? null,
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
    if (delivery.sent) {
      await reactivateBroadcastConversationForAi(businessId, recipient.contactId, broadcastSentAt);
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

async function storeConsentRequestMessage(params: {
  businessId: string;
  contactId: string;
  conversationId?: string;
  providerMessageId: string;
  body: string;
}) {
  if (!params.conversationId) return;
  try {
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: params.conversationId,
        providerMessageId: params.providerMessageId,
        senderType: SenderType.USER,
        messageType: MessageType.TEXT,
        messageBody: params.body,
        intent: "broadcast_consent_request",
        processingStatus: ProcessingStatus.PROCESSED,
        deliveryStatus: "ACCEPTED",
        rawPayload: {
          channel: "WHATSAPP",
          direction: "OUTBOUND",
          source: "broadcast_consent_request",
          contactId: params.contactId,
        },
      },
    });
    await prisma.whatsAppConversation.updateMany({
      where: { id: params.conversationId, businessId: params.businessId },
      data: { lastMessageAt: new Date() },
    });
  } catch (error) {
    console.error("broadcast_consent_message_store_failed", {
      businessId: params.businessId,
      contactId: params.contactId,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function reactivateBroadcastConversationForAi(businessId: string, contactId: string, broadcastSentAt: Date) {
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { businessId, contactId, channel: "WHATSAPP", status: ConversationStatus.HUMAN_NEEDED },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true, lastCustomerMessageAt: true },
  });
  if (!conversation) return;
  if (conversation.lastCustomerMessageAt && conversation.lastCustomerMessageAt > broadcastSentAt) return;

  const latestSystemEvent = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: conversation.id,
      senderType: SenderType.SYSTEM,
      intent: { in: ["human_takeover_enabled", "human_takeover_released", "human_takeover_timeout"] },
    },
    orderBy: { createdAt: "desc" },
    select: { intent: true },
  });
  if (!shouldReactivateBroadcastConversation(conversation.status, latestSystemEvent?.intent)) return;

  const reactivatedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.whatsAppConversation.updateMany({
      where: { id: conversation.id, businessId, status: ConversationStatus.HUMAN_NEEDED },
      data: { status: ConversationStatus.OPEN, resolvedAt: null, lastMessageAt: reactivatedAt },
    });
    if (updated.count !== 1) return;

    await tx.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        providerMessageId: `system-${crypto.randomUUID()}`,
        senderType: SenderType.SYSTEM,
        messageType: MessageType.SYSTEM,
        messageBody: "AI auto-reply aktif kembali setelah template broadcast dikirim.",
        intent: "broadcast_ai_reactivated",
        processingStatus: ProcessingStatus.PROCESSED,
        deliveryStatus: "STORED",
      },
    });
  });
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
