import { getPublicAppUrl } from "@/server/email";

type DurableWakeResult =
  | { configured: false; dispatched: false; reason: "qstash_not_configured" }
  | { configured: true; dispatched: true; messageId: string | null }
  | { configured: true; dispatched: false; reason: string };

/**
 * QStash is optional locally, but it closes the serverless reliability gap in
 * production: once a DB job is committed, an external durable delivery wakes
 * the worker even if the originating Vercel invocation is frozen.
 */
export async function dispatchDurableJobWakeup(): Promise<DurableWakeResult> {
  const qstashToken = process.env.QSTASH_TOKEN?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!qstashToken || !cronSecret) {
    return {
      configured: false,
      dispatched: false,
      reason: "qstash_not_configured",
    };
  }

  const destination = new URL("/api/cron/jobs", getPublicAppUrl()).toString();
  const endpoint =
    process.env.QSTASH_PUBLISH_URL?.trim() ||
    "https://qstash.upstash.io/v2/publish";

  try {
    const response = await fetch(
      `${endpoint.replace(/\/+$/, "")}/${encodeURIComponent(destination)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${qstashToken}`,
          "Content-Type": "application/json",
          "Upstash-Forward-Authorization": `Bearer ${cronSecret}`,
          "Upstash-Method": "POST",
          "Upstash-Retries": "5",
          "Upstash-Retry-Delay": "max(1000, pow(2, retried) * 1000)",
          "Upstash-Timeout": "55s",
        },
        body: JSON.stringify({ source: "aijou-job-wakeup" }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      messageId?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      return {
        configured: true,
        dispatched: false,
        reason: (body?.error || `qstash_http_${response.status}`).slice(0, 160),
      };
    }

    return {
      configured: true,
      dispatched: true,
      messageId: body?.messageId ?? null,
    };
  } catch (error) {
    return {
      configured: true,
      dispatched: false,
      reason: (
        error instanceof Error ? error.name : "qstash_dispatch_failed"
      ).slice(0, 160),
    };
  }
}

export async function wakeAndDrainJobs(limit = 2) {
  const wake = await dispatchDurableJobWakeup();
  if (wake.configured && !wake.dispatched) {
    console.error("durable_job_wakeup_failed", { reason: wake.reason });
  }

  const { processPendingJobs } = await import("@/server/jobs/background-jobs");
  const results = await processPendingJobs(limit);
  return { wake, processed: results.length };
}
