import { createHash } from "node:crypto";

type LoginBucket = {
  failures: number;
  resetAt: number;
};

type LoginGuardResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const maxBuckets = 2_000;
const buckets = new Map<string, LoginBucket>();

export function checkLoginLimit(email: string, clientIp: string): LoginGuardResult {
  const now = Date.now();
  let retryAfterSeconds = 0;

  for (const rule of loginRules(email, clientIp)) {
    const bucket = getActiveBucket(rule.key, now);

    if (bucket && bucket.failures >= rule.maxFailures) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Math.ceil((bucket.resetAt - now) / 1_000),
      );
    }
  }

  return {
    allowed: retryAfterSeconds === 0,
    retryAfterSeconds,
  };
}

export function recordLoginFailure(email: string, clientIp: string) {
  const now = Date.now();

  for (const rule of loginRules(email, clientIp)) {
    const existing = getActiveBucket(rule.key, now);
    setBounded(rule.key, {
      failures: (existing?.failures ?? 0) + 1,
      resetAt: existing?.resetAt ?? now + rule.windowMs,
    });
  }
}

export function recordLoginSuccess(email: string, clientIp: string) {
  const identity = hashKey(email.trim().toLowerCase());
  const ip = hashKey(clientIp);

  buckets.delete(`login:account:${identity}`);
  buckets.delete(`login:pair:${identity}:${ip}`);
}

function loginRules(email: string, clientIp: string) {
  const identity = hashKey(email.trim().toLowerCase());
  const ip = hashKey(clientIp);

  return [
    {
      key: `login:pair:${identity}:${ip}`,
      maxFailures: 8,
      windowMs: 15 * 60_000,
    },
    {
      key: `login:account:${identity}`,
      maxFailures: 20,
      windowMs: 60 * 60_000,
    },
    {
      key: `login:ip:${ip}`,
      maxFailures: 50,
      windowMs: 15 * 60_000,
    },
  ];
}

function getActiveBucket(key: string, now: number) {
  const bucket = buckets.get(key);

  if (!bucket) {
    return null;
  }

  if (bucket.resetAt <= now) {
    buckets.delete(key);
    return null;
  }

  return bucket;
}

function setBounded(key: string, bucket: LoginBucket) {
  if (buckets.has(key)) {
    buckets.delete(key);
  }

  while (buckets.size >= maxBuckets) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }

  buckets.set(key, bucket);
}

function hashKey(value: string) {
  return createHash("sha256").update(value || "unknown").digest("base64url").slice(0, 22);
}
