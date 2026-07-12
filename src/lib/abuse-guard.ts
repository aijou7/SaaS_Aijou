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
const maxBuckets = 10_000;

export function getClientIp(request: NextRequest) {
  return getClientIpFromHeaders(request.headers);
}

export function getClientIpFromHeaders(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const direct = headers.get("x-real-ip")?.trim();
  const candidate = forwarded || direct || "unknown";

  // Avoid allowing an attacker-controlled forwarding header to create
  // unbounded database keys. Vercel replaces this header in production, but
  // bounding it is still useful for local proxies and alternate deployments.
  return candidate.slice(0, 64) || "unknown";
}

export function checkAbuseLimit(key: string, rules: RateLimitRule[]): RateLimitResult {
  const now = Date.now();
  let retryAfterSeconds = 0;

  for (const rule of rules) {
    const bucketKey = `${key}:${rule.windowMs}`;
    const bucket = buckets.get(bucketKey);

    if (!bucket || bucket.resetAt <= now) {
      ensureBucketCapacity(now);
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

  if (buckets.size > maxBuckets / 2) {
    pruneBuckets(now);
  }

  return {
    allowed: retryAfterSeconds === 0,
    retryAfterSeconds,
  };
}

function ensureBucketCapacity(now: number) {
  if (buckets.size < maxBuckets) return;
  pruneBuckets(now);
  if (buckets.size < maxBuckets) return;

  const toEvict = Math.ceil(maxBuckets * 0.1);
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed += 1;
    if (removed >= toEvict) break;
  }
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
