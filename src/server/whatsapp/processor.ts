import { extractExpenseFromTextAi } from "@/server/ai/expense-extractor";
import { detectIntentFromText, extractExpenseFromText } from "@/server/ai/intent";
import {
  cancelActiveExpense,
  confirmActiveExpense,
  createPendingExpenseFromExtraction,
} from "@/server/finance/expense-flow";
import { createReceiptDraftFromImage } from "@/server/receipts/receipt-flow";
import { extractMessages, type WhatsAppWebhookPayload } from "@/server/whatsapp/payload";
import {
  findBusinessForWhatsAppMessage,
  storeIncomingWhatsAppMessage,
} from "@/server/whatsapp/store";

export async function processIncomingWhatsAppWebhook(payload: WhatsAppWebhookPayload) {
  const messages = extractMessages(payload);

  if (messages.length === 0) {
    return {
      received: true,
      processed: 0,
    };
  }

  const processedMessages = await Promise.all(messages.map(async (message) => {
    if (message.type === "text" && message.text?.body) {
      const intent = detectIntentFromText(message.text.body);
      const extraction =
        intent.intent === "expense_create"
          ? await extractExpenseFromTextAi(message.text.body)
          : null;

      const storage = await persistMessage({
        payload,
        message,
        intent: intent.intent,
      });

      const action = await processTextAction({
        storage,
        text: message.text.body,
        intent,
        extraction,
      });

      return {
        providerMessageId: message.id,
        from: message.from,
        type: message.type,
        intent,
        extraction,
        storage,
        action,
        reply: action?.reply ?? null,
      };
    }

    if (message.type === "image") {
      const storage = await persistMessage({
        payload,
        message,
        intent: "expense_create",
      });

      const action = await processImageAction({
        storage,
        providerMediaId: message.image?.id,
      });

      return {
        providerMessageId: message.id,
        from: message.from,
        type: message.type,
        intent: {
          intent: "expense_create",
          confidenceScore: 0.62,
        },
        media: message.image,
        storage,
        action,
        reply: action?.reply ?? null,
      };
    }

    const storage = await persistMessage({
      payload,
      message,
      intent: "unknown",
    });

    return {
      providerMessageId: message.id,
      from: message.from,
      type: message.type,
      intent: {
        intent: "unknown",
        confidenceScore: 0.2,
      },
      storage,
    };
  }));

  return {
    received: true,
    processed: processedMessages.length,
    messages: processedMessages,
  };
}

async function processImageAction(params: {
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

async function processTextAction(params: {
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
        ? "Rekap bulan ini akan tersedia setelah query summary dashboard tersambung."
        : null,
  };
}

function isStoredMessage(
  storage: Awaited<ReturnType<typeof persistMessage>>,
): storage is Extract<Awaited<ReturnType<typeof persistMessage>>, { businessId: string }> {
  return "businessId" in storage && "conversationId" in storage && "messageId" in storage;
}

async function persistMessage(params: {
  payload: WhatsAppWebhookPayload;
  message: ReturnType<typeof extractMessages>[number];
  intent: string;
}) {
  if (!params.message.id) {
    return {
      stored: false,
      reason: "missing_provider_message_id",
    };
  }

  const business = await findBusinessForWhatsAppMessage(params.message);

  if (!business) {
    return {
      stored: false,
      reason: "business_not_configured",
      businessIdentifiers: params.message.businessIdentifiers,
    };
  }

  const result = await storeIncomingWhatsAppMessage({
    businessId: business.id,
    message: params.message,
    payload: params.payload,
    intent: params.intent,
  });

  return {
    stored: true,
    ...result,
  };
}
