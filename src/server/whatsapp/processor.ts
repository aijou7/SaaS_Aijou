import {
  ConversationStatus,
  Prisma,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { extractExpenseFromTextAi } from "@/server/ai/expense-extractor";
import { detectIntentFromText, extractExpenseFromText } from "@/server/ai/intent";
import {
  deliverStoredWhatsAppTextMessage,
  sendAutomatedWhatsAppReply,
  simulateCustomerMessageForBusiness,
} from "@/server/conversations/conversations";
import {
  cancelActiveExpense,
  confirmActiveExpense,
  createPendingExpenseFromExtraction,
} from "@/server/finance/expense-flow";
import { createReceiptDraftFromImage } from "@/server/receipts/receipt-flow";
import { applyWhatsAppDeliveryStatuses } from "@/server/whatsapp/delivery-status";
import {
  compactWhatsAppMessagePayload,
  extractMessages,
  type ExtractedWhatsAppMessage,
  type WhatsAppWebhookPayload,
} from "@/server/whatsapp/payload";
import {
  findBusinessForQueuedWhatsApp,
  findBusinessForWhatsAppMessage,
  storeIncomingWhatsAppMessage,
  type WhatsAppMessageRole,
} from "@/server/whatsapp/store";

type ResolvedBusiness = NonNullable<
  Awaited<ReturnType<typeof findBusinessForWhatsAppMessage>>
>;

export async function processIncomingWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
  const messages = extractMessages(payload);

  if (messages.length === 0) {
    return {
      received: true,
      processed: 0,
    };
  }

  const processedMessages = await mapWithConcurrency(messages, 4, (message) =>
    processIncomingMessage(message),
  );

  return {
    received: true,
    processed: processedMessages.length,
    messages: processedMessages,
  };
}

export async function processQueuedWhatsAppWebhook(payload: unknown, businessId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Queued WhatsApp webhook payload is invalid.");
  }

  const webhook = payload as WhatsAppWebhookPayload;
  const messages = extractMessages(webhook);
  const businessIdentifiers = [...new Set(messages.flatMap((message) => message.businessIdentifiers))];
  const expectedBusiness =
    messages.length > 0
      ? await findBusinessForQueuedWhatsApp(businessId, businessIdentifiers)
      : null;

  if (messages.length > 0 && !expectedBusiness) {
    throw new Error("Queued WhatsApp webhook does not belong to the expected workspace.");
  }

  const deliveryStatuses = await applyWhatsAppDeliveryStatuses(webhook, businessId);
  const processedMessages = expectedBusiness
    ? await mapWithConcurrency(messages, 4, (message) => {
        const configuredPhoneNumberId = expectedBusiness.whatsAppSettings?.phoneNumberId;
        if (!configuredPhoneNumberId || !message.businessIdentifiers.includes(configuredPhoneNumberId)) {
          throw new Error("WhatsApp message destination does not match the queued workspace.");
        }
        return processIncomingMessage(message, expectedBusiness);
      })
    : [];

  return {
    received: true,
    processed: processedMessages.length,
    messages: processedMessages,
    deliveryStatuses,
  };
}

async function processIncomingMessage(
  message: ExtractedWhatsAppMessage,
  expectedBusiness?: ResolvedBusiness,
) {
  const business = expectedBusiness ?? (await findBusinessForWhatsAppMessage(message));

  if (!business) {
    return buildMessageResult(message, {
      storage: {
        stored: false,
        reason: "business_not_configured",
        businessIdentifiers: message.businessIdentifiers,
      },
    });
  }

  const isOwner = isAuthorizedOwnerMessage(message.from, business.user.phoneNumber);

  if (message.type === "text" && message.text?.body) {
    return isOwner
      ? processOwnerTextMessage(message, business)
      : processCustomerTextMessage(message, business);
  }

  if (message.type === "image") {
    return isOwner
      ? processOwnerImageMessage(message, business)
      : processCustomerMediaMessage(message, business);
  }

  if (!isOwner) {
    return processCustomerMediaMessage(message, business);
  }

  const storage = await persistMessage({
    business,
    intent: "unknown",
    message,
    role: "OWNER_FINANCE",
  });

  return buildMessageResult(message, {
    intent: { intent: "unknown", confidenceScore: 0.2 },
    storage,
  });
}

async function processOwnerTextMessage(
  message: ExtractedWhatsAppMessage,
  business: ResolvedBusiness,
) {
  const text = message.text?.body ?? "";
  const intent = detectIntentFromText(text);
  const extraction =
    intent.intent === "expense_create" ? await extractExpenseFromTextAi(text) : null;
  const storage = await persistMessage({
    business,
    intent: intent.intent,
    message,
    role: "OWNER_FINANCE",
  });
  const action = await processOwnerTextAction({
    extraction,
    intent,
    storage,
    text,
  });
  const reply =
    action.reply ??
    (isStoredMessage(storage) && storage.duplicate
      ? await findLoggedReply(storage.messageId)
      : null);
  const delivery =
    reply && isStoredMessage(storage) && message.id && message.from
      ? await sendAutomatedWhatsAppReply({
          businessId: business.id,
          conversationId: storage.conversationId,
          to: message.from,
          body: reply,
          intent: `owner_${action.action}`,
          sourceProviderMessageId: message.id,
        })
      : null;

  return buildMessageResult(message, {
    action,
    delivery,
    extraction,
    intent,
    reply: action.reply,
    storage,
  });
}

async function processCustomerTextMessage(
  message: ExtractedWhatsAppMessage,
  business: ResolvedBusiness,
) {
  if (!message.id || !message.from) {
    return buildMessageResult(message, {
      storage: {
        stored: false,
        reason: !message.id ? "missing_provider_message_id" : "missing_sender_phone",
      },
    });
  }

  const result = await simulateCustomerMessageForBusiness(business.id, {
    leadSource: "WHATSAPP",
    message: (message.text?.body ?? "").slice(0, 4_096),
    phoneNumber: message.from,
    providerMessageId: message.id,
    rawPayload: toJsonValue(compactWhatsAppMessagePayload(message)),
  });
  const storage = {
    stored: true,
    duplicate: result.deduped ?? false,
    businessId: business.id,
    messageId: result.customerMessageId,
    conversationId: result.conversationId,
    mediaFileId: null,
  };
  const delivery =
    result.aiMessageId && message.from
      ? await deliverStoredWhatsAppTextMessage({
          businessId: business.id,
          messageId: result.aiMessageId,
          to: message.from,
        })
      : null;

  return buildMessageResult(message, {
    action: {
      action: result.deduped ? "duplicate_ignored" : "customer_sales_message_processed",
      conversationId: result.conversationId,
      status: result.status,
    },
    delivery,
    intent: {
      intent: "customer_service",
      confidenceScore: 0.9,
    },
    reply: result.deduped ? null : result.aiReply,
    storage,
  });
}

async function processOwnerImageMessage(
  message: ExtractedWhatsAppMessage,
  business: ResolvedBusiness,
) {
  const storage = await persistMessage({
    business,
    intent: "expense_create",
    message,
    role: "OWNER_FINANCE",
  });
  const action = await processOwnerImageAction({
    providerMediaId: message.image?.id,
    storage,
  });
  const reply =
    action.reply ??
    (isStoredMessage(storage) && storage.duplicate
      ? await findLoggedReply(storage.messageId)
      : null);
  const delivery =
    reply && isStoredMessage(storage) && message.id && message.from
      ? await sendAutomatedWhatsAppReply({
          businessId: business.id,
          conversationId: storage.conversationId,
          to: message.from,
          body: reply,
          intent: `owner_${action.action}`,
          sourceProviderMessageId: message.id,
        })
      : null;

  return buildMessageResult(message, {
    action,
    delivery,
    intent: { intent: "expense_create", confidenceScore: 0.62 },
    media: message.image,
    reply: action.reply,
    storage,
  });
}

async function processCustomerMediaMessage(
  message: ExtractedWhatsAppMessage,
  business: ResolvedBusiness,
) {
  const reply =
    "File-nya sudah saya terima. Supaya tidak salah membaca konteks, tim kami akan ikut mengecek. Boleh tambahkan penjelasan singkat tentang file ini?";
  const storage = await persistMessage({
    business,
    intent: "customer_media",
    message,
    role: "CUSTOMER_SERVICE",
  });

  if (!isStoredMessage(storage) || storage.duplicate) {
    const delivery =
      isStoredMessage(storage) && storage.duplicate && message.id && message.from
        ? await sendAutomatedWhatsAppReply({
            businessId: business.id,
            conversationId: storage.conversationId,
            to: message.from,
            body: reply,
            intent: "customer_media_handoff",
            sourceProviderMessageId: message.id,
          })
        : null;
    return buildMessageResult(message, {
      action: {
        action: isStoredMessage(storage) ? "duplicate_ignored" : "message_not_stored",
      },
      delivery,
      intent: { intent: "customer_media", confidenceScore: 0.8 },
      reply: null,
      storage,
    });
  }

  const delivery = await sendAutomatedWhatsAppReply({
    businessId: business.id,
    conversationId: storage.conversationId,
    to: message.from ?? "",
    body: reply,
    intent: "customer_media_handoff",
    sourceProviderMessageId: message.id ?? storage.messageId,
  });

  await Promise.all([
    prisma.whatsAppConversation.update({
      where: { id: storage.conversationId },
      data: {
        status: ConversationStatus.HUMAN_NEEDED,
        lastMessageAt: new Date(),
      },
    }),
    prisma.aiLog.create({
      data: {
        businessId: business.id,
        conversationId: storage.conversationId,
        messageId: delivery.messageId,
        inputText: `customer_media:${message.type ?? "unknown"}`,
        outputText: reply,
        intent: "customer_media_handoff",
        confidenceScore: "0.90",
        actionTaken: "customer_media_handoff_created",
      },
    }),
  ]);

  return buildMessageResult(message, {
    action: {
      action: "customer_media_handoff_created",
      conversationId: storage.conversationId,
    },
    delivery,
    intent: { intent: "customer_media", confidenceScore: 0.8 },
    media: message.image,
    reply,
    storage,
  });
}

async function processOwnerImageAction(params: {
  storage: Awaited<ReturnType<typeof persistMessage>>;
  providerMediaId?: string;
}) {
  if (!isStoredMessage(params.storage) || params.storage.duplicate) {
    return {
      action: isStoredMessage(params.storage) ? "duplicate_ignored" : "message_not_stored",
      reply: null,
    };
  }

  return createReceiptDraftFromImage({
    context: {
      businessId: params.storage.businessId,
      conversationId: params.storage.conversationId,
      messageId: params.storage.messageId,
      mediaFileId: params.storage.mediaFileId,
    },
    providerMediaId: params.providerMediaId,
  });
}

async function processOwnerTextAction(params: {
  storage: Awaited<ReturnType<typeof persistMessage>>;
  text: string;
  intent: ReturnType<typeof detectIntentFromText>;
  extraction: ReturnType<typeof extractExpenseFromText> | null;
}) {
  if (!isStoredMessage(params.storage) || params.storage.duplicate) {
    return {
      action: isStoredMessage(params.storage) ? "duplicate_ignored" : "message_not_stored",
      reply: null,
    };
  }

  const context = {
    businessId: params.storage.businessId,
    conversationId: params.storage.conversationId,
    messageId: params.storage.messageId,
  };

  if (params.intent.intent === "expense_create" && params.extraction) {
    return createPendingExpenseFromExtraction({
      context,
      text: params.text,
      intent: params.intent,
      extraction: params.extraction,
    });
  }

  if (params.intent.intent === "expense_confirm") {
    return confirmActiveExpense({
      context,
      text: params.text,
      intent: params.intent,
    });
  }

  if (params.intent.intent === "expense_cancel") {
    return cancelActiveExpense({
      context,
      text: params.text,
      intent: params.intent,
    });
  }

  return {
    action: "no_finance_action",
    reply:
      params.intent.intent === "expense_summary"
        ? "Rekap bulan ini tersedia di dashboard Transactions."
        : null,
  };
}

function isStoredMessage(
  storage: Awaited<ReturnType<typeof persistMessage>>,
): storage is Extract<Awaited<ReturnType<typeof persistMessage>>, { businessId: string }> {
  return "businessId" in storage && "conversationId" in storage && "messageId" in storage;
}

async function persistMessage(params: {
  business: ResolvedBusiness;
  message: ExtractedWhatsAppMessage;
  intent: string;
  role: WhatsAppMessageRole;
}) {
  if (!params.message.id) {
    return {
      stored: false,
      reason: "missing_provider_message_id",
    };
  }

  const result = await storeIncomingWhatsAppMessage({
    businessId: params.business.id,
    message: params.message,
    payload: toJsonValue(compactWhatsAppMessagePayload(params.message)),
    intent: params.intent,
    role: params.role,
  });

  return {
    stored: true,
    ...result,
  };
}

function isAuthorizedOwnerMessage(from: string | undefined, ownerPhone: string | null) {
  const sender = normalizePhoneNumber(from);
  const owner = normalizePhoneNumber(ownerPhone ?? undefined);
  return Boolean(sender && owner && sender === owner);
}

function normalizePhoneNumber(value?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  let normalized = digits.startsWith("00") ? digits.slice(2) : digits;
  const countryCode = /^\d{1,4}$/.test(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "")
    ? process.env.WHATSAPP_DEFAULT_COUNTRY_CODE!
    : "62";

  if (normalized.startsWith("0")) {
    normalized = `${countryCode}${normalized.slice(1)}`;
  }

  return normalized.length >= 7 ? normalized : "";
}

function buildMessageResult(
  message: ExtractedWhatsAppMessage,
  detail: Record<string, unknown>,
) {
  return {
    providerMessageId: message.id,
    from: message.from,
    type: message.type,
    ...detail,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
) {
  if (items.length === 0) return [] as R[];

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(items.length, Math.max(1, concurrency)) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function findLoggedReply(messageId: string) {
  const log = await prisma.aiLog.findFirst({
    where: { messageId },
    orderBy: { createdAt: "desc" },
    select: { outputText: true },
  });
  return log?.outputText?.trim() || null;
}
