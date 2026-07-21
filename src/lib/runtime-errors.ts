const UNKNOWN_PATH = "/unknown";
const FALLBACK_REFERENCE = "unavailable";
const AUTO_RECOVERY_PREFIX = "aijou:auto-recovery:v1";
const SECRET_PARENT_SEGMENTS = new Set([
  "auth",
  "callback",
  "invite",
  "reset-password",
  "token",
  "verify-email",
]);

export const autoRecoveryCooldownMs = 10 * 60 * 1_000;

type RecoveryStorage = Pick<Storage, "getItem" | "setItem">;

function safeDecodePathSegment(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function looksSensitivePathSegment(segment: string) {
  const decoded = safeDecodePathSegment(segment);

  return (
    decoded.includes("@") ||
    /^\d{6,}$/.test(decoded) ||
    /^[0-9a-f]{16,}$/i.test(decoded) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      decoded,
    ) ||
    /^c[a-z0-9]{20,}$/i.test(decoded) ||
    /^[a-z0-9_-]{32,}$/i.test(decoded)
  );
}

function sanitizePathSegment(segment: string) {
  if (looksSensitivePathSegment(segment)) {
    return ":id";
  }

  const decoded = safeDecodePathSegment(segment);
  const sanitized = decoded.replace(/[^a-z0-9._~\-\[\]]/gi, "_").slice(0, 64);
  return sanitized || "_";
}

/**
 * Removes query strings, fragments, token-like path segments, and control
 * characters before a request path is shown to a user or written to logs.
 */
export function sanitizeRuntimePath(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return UNKNOWN_PATH;
  }

  try {
    const url = new URL(value.replace(/[\u0000-\u001f\u007f]/g, ""), "https://runtime.invalid");
    const rawSegments = url.pathname.split("/").filter(Boolean);
    const segments = rawSegments.map((segment, index) => {
      const parent = index > 0 ? safeDecodePathSegment(rawSegments[index - 1]).toLowerCase() : "";
      return SECRET_PARENT_SEGMENTS.has(parent) ? ":id" : sanitizePathSegment(segment);
    });
    const pathname = `/${segments.join("/")}`;

    if (pathname.length <= 180) {
      return pathname;
    }

    return `${pathname.slice(0, 164)}/:truncated`;
  } catch {
    return UNKNOWN_PATH;
  }
}

export function sanitizeErrorReference(value: unknown) {
  if (typeof value !== "string") {
    return FALLBACK_REFERENCE;
  }

  const trimmed = value.trim();
  return /^[a-z0-9._:-]{1,96}$/i.test(trimmed) ? trimmed : FALLBACK_REFERENCE;
}

export function getErrorDigest(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return FALLBACK_REFERENCE;
  }

  try {
    return sanitizeErrorReference(Reflect.get(error, "digest"));
  } catch {
    return FALLBACK_REFERENCE;
  }
}

export function getRuntimeErrorCode(error: unknown) {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0 && visited.size < 10) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) continue;
    visited.add(candidate);

    const record = candidate as Record<string, unknown>;
    for (const key of ["code", "originalCode", "sqlState", "sqlstate"]) {
      const code = record[key];
      if (typeof code === "string" && /^[a-z0-9._:-]{1,48}$/i.test(code)) {
        return code;
      }
    }
    for (const key of ["cause", "driverAdapterError", "error", "originalError", "meta"]) {
      if (record[key]) queue.push(record[key]);
    }
  }

  return "unknown";
}

function autoRecoveryKey(pathname: string, reference: string) {
  return `${AUTO_RECOVERY_PREFIX}:${sanitizeRuntimePath(pathname)}:${sanitizeErrorReference(reference)}`;
}

/**
 * Atomically claims the single automatic retry for a route error. If storage
 * is unavailable we fail closed, because retrying without a durable marker can
 * create a reload loop.
 */
export function claimAutomaticRecovery(
  storage: RecoveryStorage,
  pathname: string,
  reference: string,
  now = Date.now(),
) {
  const key = autoRecoveryKey(pathname, reference);

  try {
    const previousAttempt = Number(storage.getItem(key));
    if (
      Number.isFinite(previousAttempt) &&
      previousAttempt > 0 &&
      now - previousAttempt < autoRecoveryCooldownMs
    ) {
      return false;
    }

    storage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}
