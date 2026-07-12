import { createHash, timingSafeEqual } from "node:crypto";

export const telegramSecretHeader = "x-telegram-bot-api-secret-token";

export function hashTelegramWebhookKey(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isValidTelegramWebhookKey(value: string) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

export function verifyTelegramWebhookSecret(expected: string, received: string | null) {
  if (!expected || !received) return false;
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
