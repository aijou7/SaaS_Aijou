import { NextRequest } from "next/server";

type RateLimitRule = {
  max: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export function checkAbuseLimit(key: string, rules: RateLimitRule[]): RateLimitResult {
  const now = Date.now();
  let retryAfterSeconds = 0;

  for (const rule of rules) {
    const bucketKey = `${key}:${rule.windowMs}`;
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(bucketKey, { count: 1, resetAt: now + rule.windowMs });
      continue;
    }

    bucket.count += 1;

    if (bucket.count > rule.max) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Math.ceil((bucket.resetAt - now) / 1000),
      );
    }
  }

  if (buckets.size > 5000) {
    pruneBuckets(now);
  }

  return {
    allowed: retryAfterSeconds === 0,
    retryAfterSeconds,
  };
}

export const generousChatRules: RateLimitRule[] = [
  { max: 180, windowMs: 60_000 },
  { max: 2_000, windowMs: 60 * 60_000 },
];

export const generousBriefRules: RateLimitRule[] = [
  { max: 60, windowMs: 10 * 60_000 },
  { max: 500, windowMs: 60 * 60_000 },
];

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
