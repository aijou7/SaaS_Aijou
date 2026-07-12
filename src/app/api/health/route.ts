import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ttlCache } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();
  let databaseReady = false;

  try {
    databaseReady = await ttlCache("health:database", 5_000, async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return true;
      } catch {
        return false;
      }
    });
  } catch {
    databaseReady = false;
  }

  const body = {
    status: databaseReady ? "ok" : "degraded",
    checks: {
      application: "ok",
      database: databaseReady ? "ok" : "unavailable",
    },
    responseTimeMs: Math.max(0, Math.round(performance.now() - startedAt)),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: databaseReady ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
