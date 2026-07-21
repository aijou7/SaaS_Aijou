import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma-beta/client";
import {
  executeDatabaseOperationWithReadRetry,
  runInDatabaseTransactionContext,
  type DatabaseReadRetryOptions,
} from "@/lib/database-read-retry";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create PrismaClient.");
  }

  const adapter = new PrismaPg({
    connectionString: hardenRuntimeConnectionString(connectionString),
    max: readBoundedInteger(process.env.DATABASE_POOL_MAX, 5, 1, 10),
    connectionTimeoutMillis: readBoundedInteger(
      process.env.DATABASE_CONNECTION_TIMEOUT_MS,
      15_000,
      1_000,
      60_000,
    ),
    idleTimeoutMillis: readBoundedInteger(
      process.env.DATABASE_IDLE_TIMEOUT_MS,
      10_000,
      1_000,
      60_000,
    ),
    allowExitOnIdle: true,
    keepAlive: true,
    application_name: "aijou-saas",
  });

  const baseClient = new PrismaClient({ adapter });
  const reliableClient = baseClient.$extends({
    name: "database-read-retry",
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          return executeDatabaseOperationWithReadRetry(
            operation,
            () => query(args),
            retryOptions,
          );
        },
      },
    },
  });

  // The extension changes Prisma's structural generic type even though it does not
  // add or remove any public client methods. Keep the exported singleton typed as
  // PrismaClient so transaction callbacks retain Prisma.TransactionClient.
  return wrapTransactionContext(reliableClient) as unknown as PrismaClient;
}

function hardenRuntimeConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    if (
      url.hostname.endsWith(".neon.tech") &&
      url.searchParams.get("sslmode")?.toLowerCase() === "require" &&
      !url.searchParams.has("uselibpqcompat")
    ) {
      // pg currently treats `require` as full certificate verification but is
      // changing to libpq semantics in its next major. Make the intended secure
      // behavior explicit so an eventual dependency upgrade cannot weaken it.
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return connectionString;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma ??= prisma;

export function withDatabaseRawReadRetry<T>(work: () => Promise<T>) {
  return executeDatabaseOperationWithReadRetry("rawRead", work, retryOptions);
}

const retryOptions: DatabaseReadRetryOptions = {
  baseDelayMs: readBoundedInteger(
    process.env.DATABASE_READ_RETRY_BASE_DELAY_MS,
    100,
    0,
    2_000,
  ),
  maxAttempts: readBoundedInteger(
    process.env.DATABASE_READ_RETRY_MAX_ATTEMPTS,
    3,
    1,
    4,
  ),
  maxDelayMs: readBoundedInteger(
    process.env.DATABASE_READ_RETRY_MAX_DELAY_MS,
    800,
    0,
    5_000,
  ),
  onRetry: ({ attempt, errorCode, maxAttempts, operation }) => {
    console.warn("database_read_retry", {
      attempt,
      errorCode,
      maxAttempts,
      operation,
    });
  },
};

function readBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(minimum, Math.min(maximum, parsed));
}

function wrapTransactionContext<TClient extends object>(client: TClient) {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (property !== "$transaction" || typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) =>
        runInDatabaseTransactionContext(() => Reflect.apply(value, target, args));
    },
  });
}
