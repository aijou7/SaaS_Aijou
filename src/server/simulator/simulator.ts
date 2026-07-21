import {
  ConversationStatus,
  MessageType,
  ProcessingStatus,
  SenderType,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerServiceReplyAi,
  isHandoffRequest,
} from "@/server/ai/customer-agent";
import { getAgentRuntimeSettings } from "@/server/agent/settings";
import { extractExpenseFromTextAi } from "@/server/ai/expense-extractor";
import { detectIntentFromText } from "@/server/ai/intent";
import {
  cancelActiveExpense,
  confirmActiveExpense,
  createPendingExpenseFromExtraction,
} from "@/server/finance/expense-flow";
import { simulateCustomerMessage } from "@/server/conversations/conversations";
import { getActiveKnowledgeContext } from "@/server/knowledge/knowledge-base";
import { getActiveProductContext } from "@/server/products/catalog";
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
  const business = await requireBusinessForUser(userId);
  const settings = await getAgentRuntimeSettings(business.id);
  const result = await simulateCustomerMessage(userId, params);

  // The simulator is a private preview surface. New workspaces keep live
  // auto-reply off, but owners still need to inspect a real generated answer
  // before they explicitly activate the agent.
  if (settings.isActive || result.aiReply) return result;

  const [knowledgeContext, productContext] = await Promise.all([
    getActiveKnowledgeContext(business.id),
    getActiveProductContext(business.id),
  ]);
  const previewReply = await buildCustomerServiceReplyAi({
    businessId: business.id,
    message: params.message,
    knowledgeContext: `${knowledgeContext}\n\nKatalog aktif:\n${productContext}`,
    conversationContext: `Customer: ${params.message}`,
    settings,
  });
  const handoffRequested = isHandoffRequest(params.message);
  const previewStatus = handoffRequested
    ? ConversationStatus.HUMAN_NEEDED
    : ConversationStatus.OPEN;
  const aiMessage = await prisma.$transaction(async (tx) => {
    const message = await tx.whatsAppMessage.create({
      data: {
        conversationId: result.conversationId,
        providerMessageId: `sim-preview-ai-${crypto.randomUUID()}`,
        senderType: SenderType.AI,
        messageType: MessageType.TEXT,
        messageBody: previewReply,
        intent: "customer_service_preview",
        processingStatus: ProcessingStatus.PROCESSED,
        deliveryStatus: "STORED",
        rawPayload: { simulatorPreview: true, neverDeliverExternally: true },
      },
    });
    await tx.aiLog.create({
      data: {
        businessId: business.id,
        conversationId: result.conversationId,
        messageId: message.id,
        inputText: params.message,
        outputText: previewReply,
        intent: handoffRequested ? "handoff_request" : "customer_service_preview",
        confidenceScore: handoffRequested ? "0.95" : "0.82",
        actionTaken: "simulator_preview_reply_created",
      },
    });
    await tx.whatsAppConversation.update({
      where: { id: result.conversationId },
      data: { status: previewStatus, lastMessageAt: new Date() },
    });
    return message;
  });

  return {
    ...result,
    aiMessageId: aiMessage.id,
    aiReply: previewReply,
    status: previewStatus,
  };
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
