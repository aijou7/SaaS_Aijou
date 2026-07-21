import { NextResponse } from "next/server";
import { prisma, withDatabaseRawReadRetry } from "@/lib/prisma";
import { areCriticalRuntimeSecretsReady } from "@/lib/runtime-secret";
import { ttlCache } from "@/lib/ttl-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = performance.now();
  let databaseReady = false;
  let schemaReady = false;
  const securityReady = areCriticalRuntimeSecretsReady();

  try {
    const readiness = await ttlCache("health:database-schema:v2", 5_000, async () => {
      try {
        const rows = await withDatabaseRawReadRetry(() => prisma.$queryRaw<Array<{ schemaReady: boolean }>>`
          SELECT
            to_regclass('public.telegram_settings') IS NOT NULL
            AND to_regclass('public.signup_rate_limits') IS NOT NULL
            AND to_regclass('public.security_rate_limits') IS NOT NULL
            AND to_regclass('public.auth_tokens') IS NOT NULL
            AND to_regclass('public.workspace_memberships') IS NOT NULL
            AND to_regclass('public.team_invites') IS NOT NULL
            AND to_regclass('public.feedback') IS NOT NULL
            AND to_regclass('public.activation_events') IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM (
                VALUES
                  ('users', 'status'),
                  ('users', 'emailVerifiedAt'),
                  ('businesses', 'widgetAllowedOrigin'),
                  ('businesses', 'widgetLastSeenAt'),
                  ('whatsapp_conversations', 'assignedToUserId'),
                  ('whatsapp_messages', 'sentByUserId')
              ) AS expected("tableName", "columnName")
              LEFT JOIN information_schema.columns AS actual
                ON actual.table_schema = 'public'
                AND actual.table_name = expected."tableName"
                AND actual.column_name = expected."columnName"
              WHERE actual.column_name IS NULL
            )
            AS "schemaReady"
        `);
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

  const ready = databaseReady && schemaReady && securityReady;

  const body = {
    status: ready ? "ok" : "degraded",
    checks: {
      application: "ok",
      database: databaseReady ? "ok" : "unavailable",
      schema: schemaReady ? "ok" : "migration_required",
      security: securityReady ? "ok" : "configuration_required",
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
