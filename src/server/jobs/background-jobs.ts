import { randomUUID } from "node:crypto";
import { BackgroundJobStatus, Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { upsertLeadSummaryFromConversation } from "@/server/leads/leads";
import {
  leadRefreshRerunMarker,
  markLeadRefreshRerun,
  normalizeJobBatchLimit,
  orderTenantFairCandidates,
} from "@/server/jobs/job-scheduling";

const leadRefreshJob = "LEAD_REFRESH";
const whatsAppWebhookJob = "WHATSAPP_WEBHOOK";
const telegramWebhookJob = "TELEGRAM_WEBHOOK";
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
  const dedupeKey = `lead-refresh:${params.conversationId}`;
  const rerunPayload = markLeadRefreshRerun(payload);

  // This UPSERT deliberately preserves a live PROCESSING lease. A new message
  // only replaces the queued payload and records that one fresh pass is due.
  // PostgreSQL serializes this row update with the worker settlement below, so
  // enqueue-before-settle and settle-before-enqueue both leave a PENDING rerun.
  const jobs = await prisma.$queryRaw<
    Array<{ id: string; status: BackgroundJobStatus }>
  >(Prisma.sql`
    INSERT INTO "background_jobs" (
      "id", "businessId", "type", "dedupeKey", "payload", "status",
      "attempts", "maxAttempts", "runAfter", "createdAt", "updatedAt"
    ) VALUES (
      ${randomUUID()},
      ${params.businessId},
      ${leadRefreshJob},
      ${dedupeKey},
      ${JSON.stringify(payload)}::jsonb,
      ${BackgroundJobStatus.PENDING}::"BackgroundJobStatus",
      0,
      5,
      ${runAfter},
      ${runAfter},
      ${runAfter}
    )
    ON CONFLICT ("dedupeKey") DO UPDATE SET
      "type" = EXCLUDED."type",
      "payload" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN ${JSON.stringify(rerunPayload)}::jsonb
        ELSE EXCLUDED."payload"
      END,
      "status" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN "background_jobs"."status"
        ELSE ${BackgroundJobStatus.PENDING}::"BackgroundJobStatus"
      END,
      "attempts" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN "background_jobs"."attempts"
        ELSE 0
      END,
      "runAfter" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN "background_jobs"."runAfter"
        ELSE EXCLUDED."runAfter"
      END,
      "lockedAt" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN "background_jobs"."lockedAt"
        ELSE NULL
      END,
      "lastError" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN "background_jobs"."lastError"
        ELSE NULL
      END,
      "completedAt" = CASE
        WHEN "background_jobs"."status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
          THEN "background_jobs"."completedAt"
        ELSE NULL
      END,
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "id", "status"
  `);

  const job = jobs[0];
  if (!job) throw new Error("Lead refresh job could not be queued.");
  return job;
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

export async function enqueueTelegramWebhook(params: {
  businessId: string;
  payload: Prisma.InputJsonValue;
  updateId: string;
}) {
  const dedupeKey = `telegram-webhook:${params.businessId}:${params.updateId}`;

  try {
    return await prisma.backgroundJob.create({
      data: {
        businessId: params.businessId,
        type: telegramWebhookJob,
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
  if (!existing) throw new Error("Queued Telegram webhook could not be recovered.");
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

export async function processPendingJobs(
  limit = 25,
  deadlineAt = Number.POSITIVE_INFINITY,
  minimumRemainingMs = 0,
) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - staleLockMs);
  const safeLimit = normalizeJobBatchLimit(limit);
  const candidatePool = await prisma.backgroundJob.findMany({
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
    orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: Math.min(500, Math.max(50, safeLimit * 10)),
  });
  const candidates = orderTenantFairCandidates(candidatePool, safeLimit);

  const results: Array<{ id: string; ok: boolean }> = [];
  for (const candidate of candidates) {
    if (Date.now() + Math.max(0, minimumRemainingMs) >= deadlineAt) break;
    const lockedAt = new Date();
    const claimStaleBefore = new Date(lockedAt.getTime() - staleLockMs);
    const claimedRows = await prisma.$queryRaw<
      Array<{
        id: string;
        businessId: string;
        type: string;
        payload: Prisma.JsonValue;
        attempts: number;
        maxAttempts: number;
      }>
    >(Prisma.sql`
      UPDATE "background_jobs"
      SET
        "status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus",
        "lockedAt" = ${lockedAt},
        "attempts" = "attempts" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${candidate.id}
        AND (
          (
            "status" = ${BackgroundJobStatus.PENDING}::"BackgroundJobStatus"
            AND "runAfter" <= ${lockedAt}
          )
          OR (
            "status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
            AND ("lockedAt" IS NULL OR "lockedAt" < ${claimStaleBefore})
          )
        )
      RETURNING "id", "businessId", "type", "payload", "attempts", "maxAttempts"
    `);
    const claimed = claimedRows[0];
    if (!claimed) continue;

    try {
      await executeJob(claimed.type, claimed.payload, claimed.businessId);
      const completed = await settleSuccessfulJob({
        id: claimed.id,
        lockedAt,
        canRerun: claimed.type === leadRefreshJob,
      });
      if (completed) results.push({ id: claimed.id, ok: true });
    } catch (error) {
      const attempts = claimed.attempts;
      const exhausted = attempts >= claimed.maxAttempts;
      const failed = await settleFailedJob({
        id: claimed.id,
        lockedAt,
        canRerun: claimed.type === leadRefreshJob,
        exhausted,
        retryAt: new Date(
          Date.now() + Math.min(15 * 60_000, 2 ** attempts * 5_000),
        ),
        errorMessage: (error instanceof Error ? error.message : "Job failed").slice(
          0,
          1_000,
        ),
      });
      if (failed) results.push({ id: claimed.id, ok: false });
    }
  }

  return results;
}

export async function pruneBackgroundJobs() {
  const completedBefore = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const failedBefore = new Date(Date.now() - 90 * 24 * 60 * 60_000);
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

export async function getQueueHealthSnapshot() {
  const [counts, oldestPending, recentFailed] = await Promise.all([
    prisma.backgroundJob.groupBy({ by: ["status"], _count: true }),
    prisma.backgroundJob.findFirst({
      where: { status: BackgroundJobStatus.PENDING },
      orderBy: { runAfter: "asc" },
      select: { runAfter: true },
    }),
    prisma.backgroundJob.count({
      where: { status: BackgroundJobStatus.FAILED, updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
    }),
  ]);
  return {
    counts: Object.fromEntries(counts.map((item) => [item.status, item._count])),
    oldestPendingAt: oldestPending?.runAfter ?? null,
    oldestPendingAgeMs: oldestPending ? Math.max(0, Date.now() - oldestPending.runAfter.getTime()) : 0,
    failedLast24h: recentFailed,
  };
}

export async function retryFailedJob(jobId: string, businessId?: string) {
  return prisma.backgroundJob.updateMany({
    where: {
      id: jobId,
      status: BackgroundJobStatus.FAILED,
      ...(businessId ? { businessId } : {}),
    },
    data: {
      status: BackgroundJobStatus.PENDING,
      attempts: 0,
      runAfter: new Date(),
      lockedAt: null,
      lastError: null,
      completedAt: null,
    },
  });
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

  if (type === telegramWebhookJob) {
    if (!jsonObject(payload)) throw new Error("Queued Telegram payload is invalid.");
    const { processQueuedTelegramWebhook } = await import("@/server/telegram/processor");
    await processQueuedTelegramWebhook(payload, businessId);
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

async function settleSuccessfulJob(params: {
  id: string;
  lockedAt: Date;
  canRerun: boolean;
}) {
  const rows = await prisma.$queryRaw<Array<{ status: BackgroundJobStatus }>>(
    Prisma.sql`
      UPDATE "background_jobs"
      SET
        "status" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN ${BackgroundJobStatus.PENDING}::"BackgroundJobStatus"
          ELSE ${BackgroundJobStatus.COMPLETED}::"BackgroundJobStatus"
        END,
        "payload" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN "payload" - ${leadRefreshRerunMarker}
          ELSE '{}'::jsonb
        END,
        "attempts" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN 0
          ELSE "attempts"
        END,
        "runAfter" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN CURRENT_TIMESTAMP
          ELSE "runAfter"
        END,
        "completedAt" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN NULL
          ELSE CURRENT_TIMESTAMP
        END,
        "lockedAt" = NULL,
        "lastError" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${params.id}
        AND "status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
        AND "lockedAt" = ${params.lockedAt}
      RETURNING "status"
    `,
  );
  return rows.length === 1;
}

async function settleFailedJob(params: {
  id: string;
  lockedAt: Date;
  canRerun: boolean;
  exhausted: boolean;
  retryAt: Date;
  errorMessage: string;
}) {
  const rows = await prisma.$queryRaw<Array<{ status: BackgroundJobStatus }>>(
    Prisma.sql`
      UPDATE "background_jobs"
      SET
        "status" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN ${BackgroundJobStatus.PENDING}::"BackgroundJobStatus"
          WHEN ${params.exhausted}
            THEN ${BackgroundJobStatus.FAILED}::"BackgroundJobStatus"
          ELSE ${BackgroundJobStatus.PENDING}::"BackgroundJobStatus"
        END,
        "payload" = "payload" - ${leadRefreshRerunMarker},
        "attempts" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN 0
          ELSE "attempts"
        END,
        "runAfter" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN CURRENT_TIMESTAMP
          ELSE ${params.retryAt}
        END,
        "completedAt" = NULL,
        "lockedAt" = NULL,
        "lastError" = CASE
          WHEN ${params.canRerun}
            AND COALESCE(("payload" ->> ${leadRefreshRerunMarker})::boolean, false)
            THEN NULL
          ELSE ${params.errorMessage}
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${params.id}
        AND "status" = ${BackgroundJobStatus.PROCESSING}::"BackgroundJobStatus"
        AND "lockedAt" = ${params.lockedAt}
      RETURNING "status"
    `,
  );
  return rows.length === 1;
}
