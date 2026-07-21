import { createHash } from "node:crypto";

export function webChatProviderMessageId(
  businessId: string,
  visitorKey: string,
  clientMessageId: string,
) {
  const digest = createHash("sha256")
    .update(`${businessId}:${visitorKey}:${clientMessageId}`)
    .digest("hex")
    .slice(0, 32);
  return `web-${digest}`;
}

export function isExactWebChatReply(
  senderType: string,
  rawPayload: unknown,
  expectedProviderMessageId: string | null,
) {
  if (senderType !== "AI" || !expectedProviderMessageId) return false;
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return false;

  return (
    (rawPayload as Record<string, unknown>).inReplyToProviderMessageId ===
    expectedProviderMessageId
  );
}
