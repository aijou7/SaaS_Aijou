export const humanTakeoverDeliveryReason = "human_takeover_active";
export const conversationClosedDeliveryReason = "conversation_closed";
export const humanTakeoverIdleMs = 60 * 60_000;

export function isHumanTakeoverIdle(lastMessageAt: Date | null, now = new Date()) {
  return Boolean(
    lastMessageAt && now.getTime() - lastMessageAt.getTime() >= humanTakeoverIdleMs,
  );
}

// HUMAN_NEEDED is the current persisted state. The alternate label is also
// recognized at integration boundaries so delivery guards fail closed.
export function isHumanTakeoverActive(status: string | null | undefined) {
  return status === "HUMAN_NEEDED" || status === "HUMAN_TAKEOVER";
}

export function isAiDeliveryBlocked(status: string | null | undefined) {
  return isHumanTakeoverActive(status) || status === "CLOSED";
}

export function aiDeliverySuppressionReason(status: string | null | undefined) {
  return status === "CLOSED"
    ? conversationClosedDeliveryReason
    : humanTakeoverDeliveryReason;
}

export function resolveTakeoverSafeAiReply<TStatus extends string>(
  currentStatus: TStatus,
  desiredStatus: TStatus,
  proposedReply: string | null,
) {
  return isHumanTakeoverActive(currentStatus)
    ? { status: currentStatus, reply: null, suppressed: Boolean(proposedReply) }
    : { status: desiredStatus, reply: proposedReply, suppressed: false };
}

export function shouldSuppressAiDelivery(
  senderType: string | null | undefined,
  conversationStatus: string | null | undefined,
) {
  return senderType === "AI" && isAiDeliveryBlocked(conversationStatus);
}
