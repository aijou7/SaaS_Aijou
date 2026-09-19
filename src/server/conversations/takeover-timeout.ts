import { after } from "next/server";
import { randomUUID } from "node:crypto";
import {
  ConversationStatus,
  MessageType,
  ProcessingStatus,
  SenderType,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { dispatchDurableJobWakeup } from "@/server/jobs/durable-wakeup";
import { humanTakeoverIdleMs } from "@/server/conversations/takeover-safety";

const humanTakeoverTimeoutSeconds = humanTakeoverIdleMs / 1_000;

export function scheduleHumanTakeoverTimeoutWakeup() {
  after(async () => {
    const wake = await dispatchDurableJobWakeup({
      delaySeconds: humanTakeoverTimeoutSeconds,
    });
    if (wake.configured && !wake.dispatched) {
      console.error("human_takeover_timeout_wakeup_failed", { reason: wake.reason });
    }
  });
}

export async function releaseStaleHumanTakeovers(limit = 100) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - humanTakeoverIdleMs);
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit)));
  const candidates = await prisma.whatsAppConversation.findMany({
    where: {
      status: ConversationStatus.HUMAN_NEEDED,
      OR: [
        { lastMessageAt: { lte: cutoff } },
        { lastMessageAt: null, createdAt: { lte: cutoff } },
      ],
    },
    orderBy: [{ lastMessageAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: safeLimit,
    select: {
      id: true,
      businessId: true,
      lastMessageAt: true,
    },
  });

  let reactivated = 0;
  for (const candidate of candidates) {
    const releasedAt = new Date();
    const didRelease = await prisma.$transaction(async (tx) => {
      const updated = await tx.whatsAppConversation.updateMany({
        where: {
          id: candidate.id,
          businessId: candidate.businessId,
          status: ConversationStatus.HUMAN_NEEDED,
          lastMessageAt: candidate.lastMessageAt,
        },
        data: {
          status: ConversationStatus.OPEN,
          resolvedAt: null,
          lastMessageAt: releasedAt,
          ownerLastReadAt: releasedAt,
        },
      });

      if (updated.count !== 1) return false;

      await tx.whatsAppMessage.create({
        data: {
          conversationId: candidate.id,
          providerMessageId: `system-${randomUUID()}`,
          senderType: SenderType.SYSTEM,
          messageType: MessageType.SYSTEM,
          messageBody: "AI auto-reply aktif kembali setelah 1 jam tanpa balasan customer atau tim.",
          intent: "human_takeover_timeout",
          processingStatus: ProcessingStatus.PROCESSED,
          deliveryStatus: "STORED",
        },
      });

      return true;
    });

    if (didRelease) reactivated += 1;
  }

  return {
    scanned: candidates.length,
    reactivated,
  };
}
