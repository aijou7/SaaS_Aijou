import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  processPendingJobs,
  pruneBackgroundJobs,
} from "@/server/jobs/background-jobs";
import { prunePublicSignupRateLimits } from "@/server/auth/public-signup";

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
  const results = await processPendingJobs(10);
  const [pruned, prunedSignupLimits] = await Promise.all([
    pruneBackgroundJobs(),
    prunePublicSignupRateLimits(),
  ]);
  return NextResponse.json(
    {
      processed: results.length,
      succeeded: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      pruned,
      prunedSignupLimits,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const value = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !value) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(value);
  return left.length === right.length && timingSafeEqual(left, right);
}
