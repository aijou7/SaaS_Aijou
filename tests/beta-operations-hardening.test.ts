import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, describe, test } from "node:test";
import { isWhatsAppCustomerCareWindowOpen } from "../src/lib/whatsapp-window";
import { dispatchDurableJobWakeup } from "../src/server/jobs/durable-wakeup";

const originalFetch = globalThis.fetch;
const envSnapshot = {
  QSTASH_TOKEN: process.env.QSTASH_TOKEN,
  CRON_SECRET: process.env.CRON_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  QSTASH_PUBLISH_URL: process.env.QSTASH_PUBLISH_URL,
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("QSTASH_TOKEN", envSnapshot.QSTASH_TOKEN);
  restoreEnv("CRON_SECRET", envSnapshot.CRON_SECRET);
  restoreEnv("NEXT_PUBLIC_APP_URL", envSnapshot.NEXT_PUBLIC_APP_URL);
  restoreEnv("QSTASH_PUBLISH_URL", envSnapshot.QSTASH_PUBLISH_URL);
});

describe("beta operations hardening", () => {
  test("uses templates exactly when the WhatsApp 24-hour window closes", () => {
    const now = "2026-07-29T12:00:00.000Z";
    assert.equal(
      isWhatsAppCustomerCareWindowOpen("2026-07-28T12:00:00.001Z", now),
      true,
    );
    assert.equal(
      isWhatsAppCustomerCareWindowOpen("2026-07-28T12:00:00.000Z", now),
      false,
    );
    assert.equal(isWhatsAppCustomerCareWindowOpen("invalid", now), false);
    assert.equal(
      isWhatsAppCustomerCareWindowOpen("2026-07-29T12:00:00.001Z", now),
      false,
    );
  });

  test("durably wakes the authenticated job endpoint through QStash", async () => {
    process.env.QSTASH_TOKEN = "qstash-test-token";
    process.env.CRON_SECRET = "cron-test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/path";
    process.env.QSTASH_PUBLISH_URL = "https://qstash.example.test/v2/publish";
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return Response.json({ messageId: "msg_123" });
    };

    const result = await dispatchDurableJobWakeup();

    assert.deepEqual(result, {
      configured: true,
      dispatched: true,
      messageId: "msg_123",
    });
    const request = requests[0];
    assert.ok(request);
    assert.match(
      request.url,
      /^https:\/\/qstash\.example\.test\/v2\/publish\/https%3A%2F%2Fapp\.example\.com%2Fapi%2Fcron%2Fjobs$/,
    );
    assert.equal(
      new Headers(request.init?.headers).get("Upstash-Forward-Authorization"),
      "Bearer cron-test-secret",
    );
    assert.equal(new Headers(request.init?.headers).get("Upstash-Retries"), "5");
  });

  test("moves only untouched Jakarta seed data to Lombok", async () => {
    const migration = await readFile(
      new URL(
        "../prisma/migrations/20260729120000_beta_operations_hardening/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const seed = await readFile(
      new URL("../prisma/seed.ts", import.meta.url),
      "utf8",
    );

    assert.match(seed, /Lombok, Nusa Tenggara Barat, dan remote support/);
    assert.match(migration, /WHERE "serviceArea" = 'Jakarta, Depok, Tangerang/);
    assert.match(migration, /SET\s+"address" = 'Lombok, Nusa Tenggara Barat'/);
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
