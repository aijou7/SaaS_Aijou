import {
  ConversationStatus,
  ProcessingStatus,
  Prisma,
  SenderType,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  aiDeliverySuppressionReason,
  humanTakeoverDeliveryReason,
  shouldSuppressAiDelivery,
} from "@/server/conversations/takeover-safety";
import { sendTelegramTextMessage } from "@/server/telegram/client";
import { normalizeTelegramChatId } from "@/server/telegram/payload";
import { getTelegramDeliveryCredentialsForBusiness } from "@/server/telegram/settings";

const acceptedStatuses = new Set(["ACCEPTED", "DELIVERED", "READ"]);

export async function deliverStoredTelegramTextMessage(params: {
  businessId: string;
  messageId: string;
  chatId: string;
}) {
  const chatId = normalizeTelegramChatId(params.chatId);
  const message = await prisma.whatsAppMessage.findFirst({
    where: {
      id: params.messageId,
      conversation: { businessId: params.businessId, channel: "TELEGRAM" },
    },
    select: {
      id: true,
      providerMessageId: true,
      messageBody: true,
      rawPayload: true,
      deliveryStatus: true,
      senderType: true,
      conversation: { select: { status: true } },
    },
  });

  if (!message?.messageBody) throw new Error("Pesan outbound Telegram tidak ditemukan.");

  if (acceptedStatuses.has(message.deliveryStatus)) {
    return {
      accepted: true as const,
      delivered: true,
      deliveryStatus: message.deliveryStatus,
      providerMessageId: message.providerMessageId,
      reason: null,
      retryable: false,
    };
  }

  if (
    message.deliveryStatus === "PENDING" &&
    shouldSuppressAiDelivery(message.senderType, message.conversation.status)
  ) {
    return suppressTelegramAiDelivery(
      message.id,
      message.providerMessageId,
      message.conversation.status,
    );
  }
  if (!chatId) return failWithoutClaim(message.id, "telegram_chat_id_invalid");

  const claim = await prisma.whatsAppMessage.updateMany({
    where: {
      id: message.id,
      deliveryStatus: "PENDING",
      conversation: {
        businessId: params.businessId,
        channel: "TELEGRAM",
        ...(message.senderType === SenderType.AI
          ? {
              status: {
                notIn: [ConversationStatus.HUMAN_NEEDED, ConversationStatus.CLOSED],
              },
            }
          : {}),
      },
    },
    data: {
      deliveryStatus: "SENDING",
      deliveryError: null,
      processingStatus: ProcessingStatus.RECEIVED,
    },
  });

  if (claim.count !== 1) {
    const current = await prisma.whatsAppMessage.findUnique({
      where: { id: message.id },
      select: {
        deliveryStatus: true,
        providerMessageId: true,
        deliveryError: true,
        senderType: true,
        conversation: { select: { status: true } },
      },
    });
    const accepted = acceptedStatuses.has(current?.deliveryStatus ?? "");
    if (
      !accepted &&
      current?.deliveryStatus === "PENDING" &&
      shouldSuppressAiDelivery(current.senderType, current.conversation.status)
    ) {
      return suppressTelegramAiDelivery(
        message.id,
        current.providerMessageId ?? message.providerMessageId,
        current.conversation.status,
      );
    }
    return {
      accepted,
      delivered: accepted,
      deliveryStatus: current?.deliveryStatus ?? "UNKNOWN",
      providerMessageId: current?.providerMessageId ?? message.providerMessageId,
      reason: accepted ? null : current?.deliveryError ?? "telegram_delivery_already_claimed",
      retryable: false,
    };
  }

  const takeoverSuppressed = await suppressClaimedTelegramAiDelivery(
    message.id,
    params.businessId,
    message.senderType,
    message.providerMessageId,
  );
  if (takeoverSuppressed) return takeoverSuppressed;

  const credentials = await getTelegramDeliveryCredentialsForBusiness(params.businessId);
  if (!credentials?.botToken) {
    return finalizeFailure({
      messageId: message.id,
      payload: message.rawPayload,
      reason: "telegram_credentials_missing",
      status: "FAILED",
    });
  }

  const delivery = await sendTelegramTextMessage({
    botToken: credentials.botToken,
    chatId,
    text: message.messageBody,
  });

  if (delivery.sent) {
    const providerMessageId = `telegram:${credentials.botId}:chat:${chatId}:message:${delivery.providerMessageId}`;
    await prisma.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        providerMessageId,
        processingStatus: ProcessingStatus.PROCESSED,
        deliveryStatus: "ACCEPTED",
        deliveryError: null,
        deliveredAt: new Date(),
        rawPayload: mergePayload(message.rawPayload, {
          accepted: true,
          providerMessageId: delivery.providerMessageId,
          status: delivery.status,
        }),
      },
    });
    return {
      accepted: true as const,
      delivered: true,
      deliveryStatus: "ACCEPTED",
      providerMessageId,
      reason: null,
      retryable: false,
    };
  }

  // Telegram explicitly rejects 429 requests before accepting the message, so
  // the durable job may retry it. Timeouts/network/5xx are ambiguous and stay
  // UNKNOWN to avoid sending a duplicate message to the customer.
  const retryable = delivery.status === 429;
  const uncertain =
    delivery.reason === "telegram_request_timeout" ||
    delivery.reason === "telegram_network_error" ||
    (typeof delivery.status === "number" && delivery.status >= 500);
  const status = retryable ? "PENDING" : uncertain ? "UNKNOWN" : "FAILED";
  const result = await finalizeFailure({
    messageId: message.id,
    payload: message.rawPayload,
    reason: delivery.reason,
    status,
    retryAfterSeconds: delivery.retryAfterSeconds,
  });
  return { ...result, retryable };
}

async function suppressClaimedTelegramAiDelivery(
  messageId: string,
  businessId: string,
  senderType: SenderType,
  providerMessageId: string,
) {
  if (senderType !== SenderType.AI) return null;
  const suppressed = await prisma.whatsAppMessage.updateMany({
    where: {
      id: messageId,
      senderType: SenderType.AI,
      deliveryStatus: "SENDING",
      conversation: {
        businessId,
        channel: "TELEGRAM",
        status: { in: [ConversationStatus.HUMAN_NEEDED, ConversationStatus.CLOSED] },
      },
    },
    data: {
      deliveryStatus: "SUPPRESSED",
      deliveryError: humanTakeoverDeliveryReason,
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });
  return suppressed.count === 1
    ? suppressedTelegramDelivery(providerMessageId)
    : null;
}

async function suppressTelegramAiDelivery(
  messageId: string,
  providerMessageId: string,
  conversationStatus: ConversationStatus,
) {
  const reason = aiDeliverySuppressionReason(conversationStatus);
  await prisma.whatsAppMessage.updateMany({
    where: {
      id: messageId,
      senderType: SenderType.AI,
      deliveryStatus: "PENDING",
    },
    data: {
      deliveryStatus: "SUPPRESSED",
      deliveryError: reason,
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });
  return suppressedTelegramDelivery(providerMessageId, reason);
}

function suppressedTelegramDelivery(
  providerMessageId: string,
  reason = humanTakeoverDeliveryReason,
) {
  return {
    accepted: false as const,
    delivered: false,
    deliveryStatus: "SUPPRESSED",
    providerMessageId,
    reason,
    retryable: false,
  };
}

async function failWithoutClaim(messageId: string, reason: string) {
  await prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: {
      deliveryStatus: "FAILED",
      deliveryError: reason,
      processingStatus: ProcessingStatus.FAILED,
    },
  });
  return {
    accepted: false as const,
    delivered: false,
    deliveryStatus: "FAILED",
    providerMessageId: null,
    reason,
    retryable: false,
  };
}

async function finalizeFailure(params: {
  messageId: string;
  payload: Prisma.JsonValue | null;
  reason: string;
  status: "PENDING" | "UNKNOWN" | "FAILED";
  retryAfterSeconds?: number | null;
}) {
  await prisma.whatsAppMessage.update({
    where: { id: params.messageId },
    data: {
      deliveryStatus: params.status,
      deliveryError: params.reason,
      processingStatus:
        params.status === "PENDING" ? ProcessingStatus.RECEIVED : ProcessingStatus.FAILED,
      rawPayload: mergePayload(params.payload, {
        accepted: false,
        reason: params.reason,
        retryAfterSeconds: params.retryAfterSeconds ?? null,
      }),
    },
  });
  return {
    accepted: false as const,
    delivered: false,
    deliveryStatus: params.status,
    providerMessageId: null,
    reason: params.reason,
    retryable: false,
  };
}

function mergePayload(value: Prisma.JsonValue | null, delivery: Record<string, unknown>) {
  const existing =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return JSON.parse(JSON.stringify({ ...existing, delivery })) as Prisma.InputJsonValue;
}
