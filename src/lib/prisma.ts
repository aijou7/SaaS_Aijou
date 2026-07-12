import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma-beta/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create PrismaClient.");
  }

  const adapter = new PrismaPg({
    connectionString,
    max: readBoundedInteger(process.env.DATABASE_POOL_MAX, 5, 1, 10),
    connectionTimeoutMillis: readBoundedInteger(
      process.env.DATABASE_CONNECTION_TIMEOUT_MS,
      5_000,
      1_000,
      30_000,
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

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma ??= prisma;

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
