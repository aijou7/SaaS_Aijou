import { MessageType, ProcessingStatus, SenderType } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { extractExpenseFromTextAi } from "@/server/ai/expense-extractor";
import { detectIntentFromText } from "@/server/ai/intent";
import {
  cancelActiveExpense,
  confirmActiveExpense,
  createPendingExpenseFromExtraction,
} from "@/server/finance/expense-flow";
import { simulateCustomerMessage } from "@/server/conversations/conversations";
import { storeIncomingWhatsAppMessage } from "@/server/whatsapp/store";
import type { ExtractedWhatsAppMessage, WhatsAppWebhookPayload } from "@/server/whatsapp/payload";

export async function simulateOwnerFinanceMessage(userId: string, message: string) {
  const business = await requireBusinessForUser(userId);
  const providerMessageId = `sim-owner-${crypto.randomUUID()}`;
  const payload = buildSimulatorPayload({
    providerMessageId,
    from: "owner-simulator",
    body: message,
    businessIdentifier: business.whatsappNumber ?? business.id,
  });
  const incomingMessage: ExtractedWhatsAppMessage = {
    id: providerMessageId,
    from: "owner-simulator",
    type: "text",
    text: { body: message },
    businessIdentifiers: [business.whatsappNumber ?? business.id],
  };
  const intent = detectIntentFromText(message);
  const storage = await storeIncomingWhatsAppMessage({
    businessId: business.id,
    message: incomingMessage,
    payload,
    intent: intent.intent,
  });

  if (storage.duplicate) {
    return {
      action: "duplicate_ignored",
      reply: null,
      conversationId: storage.conversationId,
    };
  }

  const context = {
    businessId: storage.businessId,
    conversationId: storage.conversationId,
    messageId: storage.messageId,
  };
  const result =
    intent.intent === "expense_create"
      ? await createPendingExpenseFromExtraction({
          context,
          text: message,
          intent,
          extraction: await extractExpenseFromTextAi(message),
        })
      : intent.intent === "expense_confirm"
        ? await confirmActiveExpense({ context, text: message, intent })
        : intent.intent === "expense_cancel"
          ? await cancelActiveExpense({ context, text: message, intent })
          : {
              action: "no_finance_action",
              reply:
                intent.intent === "expense_summary"
                  ? "Rekap bulan ini akan tersedia di dashboard Transactions."
                  : "Saya belum paham. Coba format: catat beli mouse Rp150.000.",
            };

  if (result.reply) {
    await createAssistantMessage(storage.conversationId, result.reply);
  }

  return {
    ...result,
    conversationId: storage.conversationId,
  };
}

export async function simulateClientChatMessage(userId: string, params: {
  phoneNumber: string;
  displayName?: string;
  message: string;
}) {
  return simulateCustomerMessage(userId, params);
}

async function createAssistantMessage(conversationId: string, message: string) {
  await prisma.whatsAppMessage.create({
    data: {
      conversationId,
      providerMessageId: `sim-ai-${crypto.randomUUID()}`,
      senderType: SenderType.AI,
      messageType: MessageType.TEXT,
      messageBody: message,
      intent: "assistant_reply",
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true, whatsappNumber: true },
  });

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  return business;
}

function buildSimulatorPayload(params: {
  providerMessageId: string;
  from: string;
  body: string;
  businessIdentifier: string;
}): WhatsAppWebhookPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: params.businessIdentifier,
              },
              messages: [
                {
                  id: params.providerMessageId,
                  from: params.from,
                  type: "text",
                  text: { body: params.body },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
