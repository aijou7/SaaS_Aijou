export const defaultJobBatchSize = 25;
export const maximumJobBatchSize = 100;
export const requestDrivenTickIntervalMs = 30_000;

export const leadRefreshRerunMarker = "__leadRefreshRerunRequested";

type DateLike = Date | string | number;

export type SchedulableJob = {
  id: string;
  businessId: string;
  runAfter: DateLike;
  createdAt: DateLike;
};

type JsonRecord = Record<string, unknown>;

export function markLeadRefreshRerun<T extends JsonRecord>(payload: T) {
  return {
    ...payload,
    [leadRefreshRerunMarker]: true,
  };
}

export function clearLeadRefreshRerun<T extends JsonRecord>(payload: T) {
  const next = { ...payload };
  delete next[leadRefreshRerunMarker];
  return next;
}

export function hasLeadRefreshRerun(payload: unknown) {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      (payload as JsonRecord)[leadRefreshRerunMarker] === true,
  );
}

/**
 * Pure lease calculation for the best-effort request-driven worker. The
 * server module keeps this lease in memory, so regular inbox polling does not
 * turn into a database poll on every request or contend on one global DB row.
 */
export function reserveRequestDrivenTick(params: {
  nowMs: number;
  nextEligibleAtMs: number;
  intervalMs?: number;
}) {
  const nowMs = finiteTimestamp(params.nowMs);
  const nextEligibleAtMs = finiteTimestamp(params.nextEligibleAtMs);
  const intervalMs = normalizeTickInterval(params.intervalMs);

  if (nowMs < nextEligibleAtMs) {
    return { reserved: false, nextEligibleAtMs } as const;
  }

  return {
    reserved: true,
    nextEligibleAtMs: nowMs + intervalMs,
  } as const;
}

export function normalizeJobBatchLimit(
  value: number,
  fallback = defaultJobBatchSize,
) {
  const normalizedFallback = Number.isFinite(fallback)
    ? Math.trunc(fallback)
    : defaultJobBatchSize;
  const safeFallback = Math.min(
    maximumJobBatchSize,
    Math.max(1, normalizedFallback),
  );

  if (!Number.isFinite(value)) return safeFallback;
  return Math.min(maximumJobBatchSize, Math.max(1, Math.trunc(value)));
}

/**
 * Orders one job per workspace in each round. A noisy workspace can still use
 * spare capacity, but it cannot fill the batch before other workspaces get a
 * turn.
 */
export function orderTenantFairCandidates<T extends SchedulableJob>(
  candidates: readonly T[],
  limit = defaultJobBatchSize,
) {
  const safeLimit = normalizeJobBatchLimit(limit);
  const queues = new Map<string, T[]>();

  for (const candidate of candidates) {
    const queue = queues.get(candidate.businessId);
    if (queue) queue.push(candidate);
    else queues.set(candidate.businessId, [candidate]);
  }

  let longestQueue = 0;
  for (const queue of queues.values()) {
    queue.sort(compareJobs);
    longestQueue = Math.max(longestQueue, queue.length);
  }

  const ordered: T[] = [];
  for (let round = 0; round < longestQueue && ordered.length < safeLimit; round += 1) {
    const jobsInRound: T[] = [];
    for (const queue of queues.values()) {
      const candidate = queue[round];
      if (candidate) jobsInRound.push(candidate);
    }
    jobsInRound.sort(compareJobs);

    for (const candidate of jobsInRound) {
      ordered.push(candidate);
      if (ordered.length >= safeLimit) break;
    }
  }

  return ordered;
}

export function calculateBacklogAgeSeconds(
  now: DateLike,
  oldest: DateLike | null | undefined,
) {
  if (oldest === null || oldest === undefined) return null;
  const nowMs = toTimestamp(now);
  const oldestMs = toTimestamp(oldest);
  if (!Number.isFinite(nowMs) || !Number.isFinite(oldestMs)) return null;
  return Math.max(0, Math.floor((nowMs - oldestMs) / 1_000));
}

function compareJobs(left: SchedulableJob, right: SchedulableJob) {
  return (
    toTimestamp(left.runAfter) - toTimestamp(right.runAfter) ||
    toTimestamp(left.createdAt) - toTimestamp(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function toTimestamp(value: DateLike) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}

function finiteTimestamp(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function normalizeTickInterval(value: number | undefined) {
  if (!Number.isFinite(value)) return requestDrivenTickIntervalMs;
  return Math.min(5 * 60_000, Math.max(5_000, Math.trunc(value ?? 0)));
}
