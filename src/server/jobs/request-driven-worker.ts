import { processPendingJobs } from "@/server/jobs/background-jobs";
import {
  requestDrivenTickIntervalMs,
  reserveRequestDrivenTick,
} from "@/server/jobs/job-scheduling";

const requestTickBatchSize = 4;
const requestTickBudgetMs = 8_000;
const minimumRemainingMs = 1_500;

let nextEligibleAtMs = 0;
let inFlight = false;

/**
 * Uses ordinary authenticated inbox traffic as a best-effort queue wake-up.
 * The in-memory lease avoids a query on every poll and avoids introducing a
 * globally contended database lease row. Job claiming itself remains atomic.
 */
export async function runRequestDrivenJobTick(options?: {
  nowMs?: number;
  deadlineAt?: number;
}) {
  const nowMs = options?.nowMs ?? Date.now();
  const deadlineAt = Math.min(
    options?.deadlineAt ?? nowMs + requestTickBudgetMs,
    nowMs + requestTickBudgetMs,
  );
  if (inFlight) return { skipped: true, processed: 0 } as const;
  if (Date.now() + minimumRemainingMs >= deadlineAt) {
    return { skipped: true, processed: 0 } as const;
  }

  const reservation = reserveRequestDrivenTick({
    nowMs,
    nextEligibleAtMs,
    intervalMs: requestDrivenTickIntervalMs,
  });
  nextEligibleAtMs = reservation.nextEligibleAtMs;
  if (!reservation.reserved) return { skipped: true, processed: 0 } as const;

  inFlight = true;
  try {
    const results = await processPendingJobs(
      requestTickBatchSize,
      deadlineAt,
      minimumRemainingMs,
    );
    return { skipped: false, processed: results.length } as const;
  } catch (error) {
    console.error("request_driven_job_tick_failed", {
      code: error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code).slice(0, 40)
        : "unknown",
    });
    return { skipped: false, processed: 0 } as const;
  } finally {
    inFlight = false;
  }
}
