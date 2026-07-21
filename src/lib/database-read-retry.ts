import { AsyncLocalStorage } from "node:async_hooks";

const RETRYABLE_READ_OPERATIONS = new Set([
  "rawRead",
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);

const TRANSIENT_PRISMA_CODES = new Set([
  "P1001", // Database server is unreachable.
  "P1002", // Database server connection timed out.
  "P1008", // Database operation timed out.
  "P1017", // Server closed the connection.
  "P2024", // Connection pool timeout.
]);

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETUNREACH",
  "EPIPE",
  "ETIMEDOUT",
]);

const TRANSIENT_POSTGRES_CODES = new Set([
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "53300", // too_many_connections
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  /can(?:not|'t) reach database server/i,
  /connection (?:has been )?closed unexpectedly/i,
  /connection (?:reset|terminated) (?:by peer|unexpectedly)/i,
  /connection pool timeout/i,
  /server closed the connection/i,
  /timed out fetching a new connection/i,
];

const databaseTransactionContext = new AsyncLocalStorage<boolean>();

type ErrorLike = Record<string, unknown>;

export type DatabaseReadRetryEvent = {
  attempt: number;
  delayMs: number;
  errorCode: string | undefined;
  maxAttempts: number;
  nextAttempt: number;
  operation: string;
};

export type DatabaseReadRetryOptions = {
  baseDelayMs?: number;
  maxAttempts?: number;
  maxDelayMs?: number;
  onRetry?: (event: DatabaseReadRetryEvent) => void;
  random?: () => number;
  sleep?: (delayMs: number) => Promise<void>;
};

export function isRetryableDatabaseReadOperation(operation: string) {
  return RETRYABLE_READ_OPERATIONS.has(operation);
}

export function isTransientDatabaseError(error: unknown) {
  return getTransientDatabaseErrorCode(error) !== undefined;
}

export function getTransientDatabaseErrorCode(error: unknown) {
  for (const candidate of walkErrorChain(error)) {
    const code = readErrorCode(candidate);

    if (code && isTransientErrorCode(code)) {
      return code;
    }

    const message = typeof candidate.message === "string" ? candidate.message : "";

    if (TRANSIENT_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
      return code ?? "TRANSIENT_CONNECTION_ERROR";
    }
  }

  return undefined;
}

export function isInsideDatabaseTransaction() {
  return databaseTransactionContext.getStore() === true;
}

export function runInDatabaseTransactionContext<T>(work: () => T) {
  return databaseTransactionContext.run(true, work);
}

export async function executeDatabaseOperationWithReadRetry<T>(
  operation: string,
  work: () => Promise<T>,
  options: DatabaseReadRetryOptions = {},
) {
  if (!isRetryableDatabaseReadOperation(operation) || isInsideDatabaseTransaction()) {
    return work();
  }

  return withDatabaseReadRetry(operation, work, options);
}

export async function withDatabaseReadRetry<T>(
  operation: string,
  work: () => Promise<T>,
  options: DatabaseReadRetryOptions = {},
) {
  const maxAttempts = toPositiveInteger(options.maxAttempts, 3);
  const baseDelayMs = toNonNegativeInteger(options.baseDelayMs, 100);
  const maxDelayMs = Math.max(
    baseDelayMs,
    toNonNegativeInteger(options.maxDelayMs, 800),
  );
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? wait;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const errorCode = getTransientDatabaseErrorCode(error);

      if (!errorCode || attempt >= maxAttempts) {
        throw error;
      }

      const exponentialDelay = Math.min(
        maxDelayMs,
        baseDelayMs * 2 ** (attempt - 1),
      );
      const jitter = 0.5 + clampRandom(random()) * 0.5;
      const delayMs = Math.round(exponentialDelay * jitter);

      options.onRetry?.({
        attempt,
        delayMs,
        errorCode,
        maxAttempts,
        nextAttempt: attempt + 1,
        operation,
      });
      await sleep(delayMs);
    }
  }
}

function isTransientErrorCode(code: string) {
  const normalized = code.toUpperCase();

  return (
    TRANSIENT_PRISMA_CODES.has(normalized) ||
    TRANSIENT_NETWORK_CODES.has(normalized) ||
    TRANSIENT_POSTGRES_CODES.has(normalized) ||
    normalized.startsWith("08")
  );
}

function readErrorCode(error: ErrorLike) {
  for (const key of ["code", "originalCode", "sqlState", "sqlstate", "errno"]) {
    const value = error[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function walkErrorChain(error: unknown) {
  const queue: unknown[] = [error];
  const result: ErrorLike[] = [];
  const visited = new Set<unknown>();

  while (queue.length > 0 && result.length < 12) {
    const candidate = queue.shift();

    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) {
      continue;
    }

    visited.add(candidate);
    const record = candidate as ErrorLike;
    result.push(record);

    for (const key of ["cause", "driverAdapterError", "error", "originalError"]) {
      if (record[key]) {
        queue.push(record[key]);
      }
    }

    if (record.meta && typeof record.meta === "object") {
      queue.push(record.meta);
    }

    if (Array.isArray(record.errors)) {
      queue.push(...record.errors);
    }
  }

  return result;
}

function toPositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || (value ?? 0) < 1) {
    return fallback;
  }

  return Math.floor(value as number);
}

function toNonNegativeInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || (value ?? -1) < 0) {
    return fallback;
  }

  return Math.floor(value as number);
}

function clampRandom(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

function wait(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}
