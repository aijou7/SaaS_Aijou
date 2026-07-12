import type { Prisma } from "@/generated/prisma-beta/client";
import { simulateCustomerMessageForBusiness } from "@/server/conversations/conversations";
import { deliverStoredTelegramTextMessage } from "@/server/telegram/delivery";
import {
  compactTelegramUpdate,
  extractTelegramInboundMessage,
  telegramProviderMessageId,
  type TelegramUpdate,
} from "@/server/telegram/payload";
import { getTelegramIdentityForBusiness } from "@/server/telegram/settings";

export async function processQueuedTelegramWebhook(payload: unknown, businessId: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Queued Telegram payload is invalid.");
  }

  const identity = await getTelegramIdentityForBusiness(businessId);
  if (!identity?.botId) {
    return { processed: false, reason: "telegram_integration_inactive" };
  }

  const inbound = extractTelegramInboundMessage(payload as TelegramUpdate);
  if (!inbound) {
    return { processed: false, reason: "telegram_update_ignored" };
  }

  const providerMessageId = telegramProviderMessageId(identity.botId, inbound.updateId);
  const result = await simulateCustomerMessageForBusiness(businessId, {
    phoneNumber: `telegram:${inbound.chatId}`,
    displayName: inbound.displayName,
    leadSource: "TELEGRAM",
    message: inbound.text,
    providerMessageId,
    rawPayload: compactTelegramUpdate(inbound) as unknown as Prisma.InputJsonValue,
  });
  const delivery = result.aiMessageId
    ? await deliverStoredTelegramTextMessage({
        businessId,
        messageId: result.aiMessageId,
        chatId: inbound.chatId,
      })
    : null;

  if (delivery?.retryable) {
    throw new Error(`Telegram delivery retry requested: ${delivery.reason}`);
  }

  return {
    processed: true,
    deduped: result.deduped,
    conversationId: result.conversationId,
    customerMessageId: result.customerMessageId,
    aiMessageId: result.aiMessageId,
    deliveryStatus: delivery?.deliveryStatus ?? null,
  };
}
