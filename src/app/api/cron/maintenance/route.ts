import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { pruneDurableRateLimits } from "@/lib/durable-rate-limit";
import { getConfiguredRuntimeSecret } from "@/lib/runtime-secret";
import {
  pruneAuthTokens,
  purgeDeletionPendingAccounts,
} from "@/server/auth/account-lifecycle";
import { prunePublicSignupRateLimits } from "@/server/auth/public-signup";
import { pruneBackgroundJobs } from "@/server/jobs/background-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const tasks = [
    ["background_jobs", pruneBackgroundJobs],
    ["signup_limits", prunePublicSignupRateLimits],
    ["security_limits", pruneDurableRateLimits],
    ["auth_tokens", pruneAuthTokens],
    ["account_purge", () => purgeDeletionPendingAccounts()],
  ] as const;
  const settled = await Promise.allSettled(tasks.map(([, task]) => task()));
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("cron_maintenance_failed", { task: tasks[index][0] });
    }
  });

  const value = (index: number) => {
    const result = settled[index];
    return result?.status === "fulfilled" ? result.value : 0;
  };

  return NextResponse.json(
    {
      maintenanceFailures: settled.filter((item) => item.status === "rejected").length,
      pruned: value(0),
      prunedSignupLimits: value(1),
      prunedSecurityLimits: value(2),
      prunedAuthTokens: value(3),
      purgedAccounts: value(4),
      elapsedMs: Date.now() - startedAt,
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
