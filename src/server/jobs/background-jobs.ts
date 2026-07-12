import { BackgroundJobStatus, Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { upsertLeadSummaryFromConversation } from "@/server/leads/leads";

const leadRefreshJob = "LEAD_REFRESH";
const whatsAppWebhookJob = "WHATSAPP_WEBHOOK";
const staleLockMs = 5 * 60_000;

export async function enqueueLeadRefresh(params: {
  businessId: string;
  conversationId: string;
  source?: string;
}) {
  const payload = {
    conversationId: params.conversationId,
    source: params.source ?? "CHAT",
  } satisfies Prisma.InputJsonObject;
  const runAfter = new Date();

  return prisma.backgroundJob.upsert({
    where: { dedupeKey: `lead-refresh:${params.conversationId}` },
    update: {
      businessId: params.businessId,
      type: leadRefreshJob,
      payload,
      status: BackgroundJobStatus.PENDING,
      attempts: 0,
      runAfter,
      lockedAt: null,
      lastError: null,
      completedAt: null,
    },
    create: {
      businessId: params.businessId,
      type: leadRefreshJob,
      dedupeKey: `lead-refresh:${params.conversationId}`,
      payload,
      status: BackgroundJobStatus.PENDING,
      runAfter,
    },
  });
}

export async function enqueueWhatsAppWebhook(params: {
  businessId: string;
  payload: Prisma.InputJsonValue;
  payloadDigest: string;
}) {
  const dedupeKey = `whatsapp-webhook:${params.businessId}:${params.payloadDigest}`;

  try {
    return await prisma.backgroundJob.create({
      data: {
        businessId: params.businessId,
        type: whatsAppWebhookJob,
        dedupeKey,
        payload: params.payload,
        status: BackgroundJobStatus.PENDING,
        runAfter: new Date(),
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }

  const existing = await prisma.backgroundJob.findUnique({ where: { dedupeKey } });
  if (!existing) {
    throw new Error("Queued WhatsApp webhook could not be recovered.");
  }

  if (existing.status !== BackgroundJobStatus.FAILED) return existing;

  await prisma.backgroundJob.updateMany({
    where: { id: existing.id, status: BackgroundJobStatus.FAILED },
    data: {
      payload: params.payload,
      status: BackgroundJobStatus.PENDING,
      attempts: 0,
      runAfter: new Date(),
      lockedAt: null,
      lastError: null,
      completedAt: null,
    },
  });

  return (await prisma.backgroundJob.findUnique({ where: { id: existing.id } })) ?? existing;
}

export async function processPendingJobs(limit = 10) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleLockMs);
  const candidates = await prisma.backgroundJob.findMany({
    where: {
      OR: [
        {
          status: BackgroundJobStatus.PENDING,
          runAfter: { lte: now },
        },
        {
          status: BackgroundJobStatus.PROCESSING,
          OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }],
        },
      ],
    },
    orderBy: { runAfter: "asc" },
    take: Math.min(25, Math.max(1, limit)),
  });

  const results: Array<{ id: string; ok: boolean }> = [];
  for (const candidate of candidates) {
    const lockedAt = new Date();
    const claimStaleBefore = new Date(lockedAt.getTime() - staleLockMs);
    const claimed = await prisma.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        OR: [
          {
            status: BackgroundJobStatus.PENDING,
            runAfter: { lte: lockedAt },
          },
          {
            status: BackgroundJobStatus.PROCESSING,
            OR: [{ lockedAt: null }, { lockedAt: { lt: claimStaleBefore } }],
          },
        ],
      },
      data: {
        status: BackgroundJobStatus.PROCESSING,
        lockedAt,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1) continue;

    try {
      await executeJob(candidate.type, candidate.payload, candidate.businessId);
      const completed = await prisma.backgroundJob.updateMany({
        where: {
          id: candidate.id,
          status: BackgroundJobStatus.PROCESSING,
          lockedAt,
        },
        data: {
          payload: {},
          status: BackgroundJobStatus.COMPLETED,
          completedAt: new Date(),
          lockedAt: null,
          lastError: null,
        },
      });
      if (completed.count === 1) results.push({ id: candidate.id, ok: true });
    } catch (error) {
      const attempts = candidate.attempts + 1;
      const exhausted = attempts >= candidate.maxAttempts;
      const failed = await prisma.backgroundJob.updateMany({
        where: {
          id: candidate.id,
          status: BackgroundJobStatus.PROCESSING,
          lockedAt,
        },
        data: {
          status: exhausted ? BackgroundJobStatus.FAILED : BackgroundJobStatus.PENDING,
          runAfter: new Date(Date.now() + Math.min(15 * 60_000, 2 ** attempts * 5_000)),
          lockedAt: null,
          lastError: (error instanceof Error ? error.message : "Job failed").slice(0, 1_000),
        },
      });
      if (failed.count === 1) results.push({ id: candidate.id, ok: false });
    }
  }

  return results;
}

export async function pruneBackgroundJobs() {
  const completedBefore = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const failedBefore = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const [completed, failed] = await Promise.all([
    prisma.backgroundJob.deleteMany({
      where: {
        status: BackgroundJobStatus.COMPLETED,
        completedAt: { lt: completedBefore },
      },
    }),
    prisma.backgroundJob.deleteMany({
      where: {
        status: BackgroundJobStatus.FAILED,
        updatedAt: { lt: failedBefore },
      },
    }),
  ]);

  return { completed: completed.count, failed: failed.count };
}

async function executeJob(type: string, payload: Prisma.JsonValue, businessId: string) {
  if (type === leadRefreshJob) {
    const object = jsonObject(payload);
    const conversationId =
      typeof object?.conversationId === "string" ? object.conversationId : "";
    const source = typeof object?.source === "string" ? object.source : "CHAT";
    if (!conversationId) throw new Error("Conversation ID is required for lead refresh.");

    const ownedConversation = await prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, businessId },
      select: { id: true },
    });
    if (!ownedConversation) {
      throw new Error("Lead refresh conversation does not belong to the queued workspace.");
    }

    await upsertLeadSummaryFromConversation(conversationId, { source });
    return;
  }

  if (type === whatsAppWebhookJob) {
    if (!jsonObject(payload)) throw new Error("Queued WhatsApp payload is invalid.");
    const { processQueuedWhatsAppWebhook } = await import("@/server/whatsapp/processor");
    await processQueuedWhatsAppWebhook(payload, businessId);
    return;
  }

  throw new Error(`Unsupported background job: ${type}`);
}

function jsonObject(value: Prisma.JsonValue) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}
