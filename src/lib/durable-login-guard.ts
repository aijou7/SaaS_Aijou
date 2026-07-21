import {
  clearDurableRateLimit,
  consumeDurableRateLimit,
  refundDurableRateLimit,
  type DurableRateRule,
} from "@/lib/durable-rate-limit";

type LoginGuardResult = { allowed: boolean; retryAfterSeconds: number };

const pairRules = [
  { scope: "login:pair:15m", max: 8, windowMs: 15 * 60_000 },
] as const satisfies readonly DurableRateRule[];
const accountRules = [
  { scope: "login:account:1h", max: 20, windowMs: 60 * 60_000 },
] as const satisfies readonly DurableRateRule[];
const ipRules = [
  { scope: "login:ip:15m", max: 50, windowMs: 15 * 60_000 },
] as const satisfies readonly DurableRateRule[];

/**
 * Atomically reserves the attempt before the expensive password check. Unlike
 * the old inspect-then-record flow, a parallel burst cannot make every request
 * observe the same stale counter.
 */
export async function reserveLoginAttempt(email: string, clientIp: string) {
  const identity = normalizeEmail(email);
  const ip = normalizeIp(clientIp);
  return mergeResults(await Promise.all([
    consumeDurableRateLimit(`${identity}\0${ip}`, pairRules),
    consumeDurableRateLimit(identity, accountRules),
    consumeDurableRateLimit(ip, ipRules),
  ]));
}

export async function recordLoginSuccess(email: string, clientIp: string) {
  const identity = normalizeEmail(email);
  const ip = normalizeIp(clientIp);
  await Promise.all([
    clearDurableRateLimit(`${identity}\0${ip}`, pairRules),
    clearDurableRateLimit(identity, accountRules),
    refundDurableRateLimit(ip, ipRules),
  ]);
}

function mergeResults(results: LoginGuardResult[]) {
  const retryAfterSeconds = Math.max(0, ...results.map((item) => item.retryAfterSeconds));
  return { allowed: retryAfterSeconds === 0, retryAfterSeconds };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase().slice(0, 254);
}

function normalizeIp(clientIp: string) {
  return (clientIp.trim() || "unknown").slice(0, 64);
}
