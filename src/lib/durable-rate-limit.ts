import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

export type DurableRateRule = {
  scope: string;
  max: number;
  windowMs: number;
};

export type DurableRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export async function consumeDurableRateLimit(
  subject: string,
  rules: readonly DurableRateRule[],
): Promise<DurableRateLimitResult> {
  let longestRetrySeconds = 0;

  for (const rule of rules) {
    validateRule(rule);
    const keyHash = digestKey(rule.scope, subject);
    const rows = await prisma.$queryRaw<Array<{ count: number; retrySeconds: number }>>`
      INSERT INTO "security_rate_limits"
        ("keyHash", "scope", "count", "windowStartedAt", "expiresAt", "updatedAt")
      VALUES
        (${keyHash}, ${rule.scope}, 1, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + (${rule.windowMs} * INTERVAL '1 millisecond'), CURRENT_TIMESTAMP)
      ON CONFLICT ("keyHash") DO UPDATE SET
        "count" = CASE
          WHEN "security_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "security_rate_limits"."count" + 1
        END,
        "windowStartedAt" = CASE
          WHEN "security_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
          ELSE "security_rate_limits"."windowStartedAt"
        END,
        "expiresAt" = CASE
          WHEN "security_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${rule.windowMs} * INTERVAL '1 millisecond')
          ELSE "security_rate_limits"."expiresAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING
        "count",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP))))::int AS "retrySeconds"
    `;
    const result = rows[0];
    if (result && result.count > rule.max) {
      longestRetrySeconds = Math.max(longestRetrySeconds, result.retrySeconds);
    }
  }

  return {
    allowed: longestRetrySeconds === 0,
    retryAfterSeconds: longestRetrySeconds,
  };
}

export async function clearDurableRateLimit(subject: string, rules: readonly DurableRateRule[]) {
  const keyHashes = rules.map((rule) => digestKey(rule.scope, subject));
  if (!keyHashes.length) return 0;
  const result = await prisma.securityRateLimit.deleteMany({
    where: { keyHash: { in: keyHashes } },
  });
  return result.count;
}

/**
 * Refunds one previously reserved attempt without resetting other callers'
 * failures. This is used after a successful login so valid traffic does not
 * consume the shared IP abuse budget, while parallel failed attempts remain
 * counted.
 */
export async function refundDurableRateLimit(
  subject: string,
  rules: readonly DurableRateRule[],
) {
  const keyHashes = rules.map((rule) => {
    validateRule(rule);
    return digestKey(rule.scope, subject);
  });
  if (!keyHashes.length) return 0;

  const result = await prisma.securityRateLimit.updateMany({
    where: {
      keyHash: { in: keyHashes },
      count: { gt: 0 },
    },
    data: { count: { decrement: 1 } },
  });
  return result.count;
}

export async function pruneDurableRateLimits() {
  const result = await prisma.securityRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  return result.count;
}

function digestKey(scope: string, subject: string) {
  return createHmac("sha256", rateLimitSecret())
    .update(`${scope}\0${subject.trim().toLowerCase()}`)
    .digest("base64url");
}

function rateLimitSecret() {
  const secret =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.SIGNUP_GUARD_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (secret && (process.env.NODE_ENV !== "production" || Buffer.byteLength(secret) >= 32)) {
    return secret;
  }
  if (process.env.NODE_ENV !== "production") return "dev-only-rate-limit-secret-change-me";
  throw new Error("RATE_LIMIT_SECRET or a strong AUTH_SECRET is required.");
}

function validateRule(rule: DurableRateRule) {
  if (!rule.scope || !Number.isSafeInteger(rule.max) || rule.max < 1) {
    throw new Error("Invalid durable rate-limit rule.");
  }
  if (!Number.isSafeInteger(rule.windowMs) || rule.windowMs < 1_000) {
    throw new Error("Invalid durable rate-limit window.");
  }
}
