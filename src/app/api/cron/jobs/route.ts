import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getConfiguredRuntimeSecret } from "@/lib/runtime-secret";
import { processPendingJobs } from "@/server/jobs/background-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  let results: Array<{ id: string; ok: boolean }> = [];
  let queueFailures = 0;
  try {
    // Do not start a provider job too close to the function deadline. Incoming
    // webhooks already process a small queue slice; this daily cron is recovery.
    results = await processPendingJobs(100, startedAt + 52_000, 25_000);
  } catch {
    queueFailures += 1;
    console.error("cron_job_pass_failed", { pass: "recovery" });
  }
  return NextResponse.json(
    {
      processed: results.length,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      queueFailures,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isAuthorized(request: NextRequest) {
  const secret = getConfiguredRuntimeSecret("CRON_SECRET");
  const value = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !value) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(value);
  return left.length === right.length && timingSafeEqual(left, right);
}
