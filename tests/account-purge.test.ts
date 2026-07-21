import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("two-phase account purge", () => {
  test("adds a terminal PURGING state in a forward-only migration", async () => {
    const [schema, migration] = await Promise.all([
      source("../prisma/schema.prisma"),
      source("../prisma/migrations/20260722120000_add_account_purging_state/migration.sql"),
    ]);

    assert.match(schema, /enum UserStatus\s*\{[\s\S]*PURGING[\s\S]*\}/);
    assert.match(migration, /ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'PURGING'/);
  });

  test("commits the durable marker and connector shutdown before external cleanup", async () => {
    const lifecycle = await source("../src/server/auth/account-lifecycle.ts");
    const coordinator = lifecycle.slice(
      lifecycle.indexOf("export async function purgeDeletionPendingAccounts"),
      lifecycle.indexOf("async function prepareAccountPurge"),
    );
    const prepare = lifecycle.slice(
      lifecycle.indexOf("async function prepareAccountPurge"),
      lifecycle.indexOf("async function getAccountReceiptMediaSnapshot"),
    );

    assert.ok(coordinator.indexOf("prepareAccountPurge(") < coordinator.indexOf("cleanupPersistedReceiptMedia("));
    assert.ok(coordinator.indexOf("cleanupPersistedReceiptMedia(") < coordinator.indexOf("finalizePreparedAccountPurge("));
    assert.match(prepare, /data:\s*\{ status: UserStatus\.PURGING \}/);
    assert.match(prepare, /disableInboundConnectors/);
    assert.doesNotMatch(prepare, /cleanupPersistedReceiptMedia/);
  });

  test("disables every inbound integration and cancels queued webhooks atomically", async () => {
    const lifecycle = await source("../src/server/auth/account-lifecycle.ts");
    const shutdown = lifecycle.slice(
      lifecycle.indexOf("async function disableInboundConnectors"),
      lifecycle.indexOf("function getPurgeTransactionBudget"),
    );

    assert.match(shutdown, /widgetAllowedOrigin:\s*disabledWidgetOrigin/);
    assert.match(shutdown, /widgetKey:\s*`purging-/);
    assert.match(shutdown, /agentSettings\.updateMany/);
    assert.match(shutdown, /whatsAppSettings\.updateMany/);
    assert.match(shutdown, /telegramSettings\.updateMany/);
    assert.match(shutdown, /paymentSettings\.updateMany/);
    assert.match(shutdown, /webhookToken:\s*null/);
    assert.match(shutdown, /status:\s*BackgroundJobStatus\.FAILED/);
  });

  test("retries PURGING rows and finalizes only a stable, teammate-safe snapshot", async () => {
    const lifecycle = await source("../src/server/auth/account-lifecycle.ts");
    const coordinator = lifecycle.slice(
      lifecycle.indexOf("export async function purgeDeletionPendingAccounts"),
      lifecycle.indexOf("async function prepareAccountPurge"),
    );
    const finalize = lifecycle.slice(
      lifecycle.indexOf("async function finalizePreparedAccountPurge"),
      lifecycle.indexOf("async function disableInboundConnectors"),
    );

    assert.match(coordinator, /'PURGING'::"UserStatus"/);
    assert.match(finalize, /activeTeammate/);
    assert.match(finalize, /BackgroundJobStatus\.PROCESSING/);
    assert.match(finalize, /receiptMediaSnapshotsMatch\(cleanedMedia, currentMedia\)/);
    assert.match(finalize, /account\."status" = 'PURGING'::"UserStatus"/);
  });

  test("login, sessions, and recovery links cannot reopen PURGING", async () => {
    const [login, session, lifecycle] = await Promise.all([
      source("../src/app/api/auth/login/route.ts"),
      source("../src/lib/session.ts"),
      source("../src/server/auth/account-lifecycle.ts"),
    ]);

    assert.match(login, /user\.status !== "ACTIVE" && user\.status !== "DELETION_PENDING"/);
    assert.match(session, /user\.status !== "ACTIVE"/);
    assert.match(lifecycle, /isAccountRecoveryAllowed/);
    assert.match(
      lifecycle,
      /status:\s*\{ in: \[UserStatus\.ACTIVE, UserStatus\.DELETION_PENDING\] \}/,
    );
  });
});
