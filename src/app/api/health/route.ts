import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ttlCache } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();
  let databaseReady = false;
  let schemaReady = false;

  try {
    const readiness = await ttlCache("health:database-schema", 5_000, async () => {
      try {
        const rows = await prisma.$queryRaw<Array<{ schemaReady: boolean }>>`
          SELECT to_regclass('public.telegram_settings') IS NOT NULL AS "schemaReady"
        `;
        return { database: true, schema: rows[0]?.schemaReady === true };
      } catch {
        return { database: false, schema: false };
      }
    });
    databaseReady = readiness.database;
    schemaReady = readiness.schema;
  } catch {
    databaseReady = false;
    schemaReady = false;
  }

  const ready = databaseReady && schemaReady;

  const body = {
    status: ready ? "ok" : "degraded",
    checks: {
      application: "ok",
      database: databaseReady ? "ok" : "unavailable",
      schema: schemaReady ? "ok" : "migration_required",
    },
    responseTimeMs: Math.max(0, Math.round(performance.now() - startedAt)),
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    status: ready ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
