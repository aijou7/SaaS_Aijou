import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getTransactionalEmailProvider,
  sendTransactionalEmail,
} from "../src/server/email";

describe("transactional email provider selection", () => {
  test("prefers a ready Cloudflare Email Service configuration", () => {
    assert.equal(
      getTransactionalEmailProvider({
        EMAIL_FROM: "Aijou AI <otp@aijoutek.pro>",
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_EMAIL_API_TOKEN: "token",
        RESEND_API_KEY: "fallback",
      }),
      "cloudflare",
    );
  });

  test("supports Resend as a rollout fallback", () => {
    assert.equal(
      getTransactionalEmailProvider({
        EMAIL_FROM: "Aijou AI <otp@aijoutek.pro>",
        RESEND_API_KEY: "fallback",
      }),
      "resend",
    );
  });

  test("fails closed when an explicitly selected provider is incomplete", () => {
    assert.equal(
      getTransactionalEmailProvider({
        EMAIL_PROVIDER: "cloudflare",
        EMAIL_FROM: "Aijou AI <otp@aijoutek.pro>",
        RESEND_API_KEY: "fallback",
      }),
      null,
    );
  });

  test("Cloudflare delivery is successful only when the recipient is accepted", async () => {
    const restore = setCloudflareTestEnvironment();
    const originalFetch = globalThis.fetch;
    const requestBodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = async (_input, init) => {
      requestBodies.push(
        JSON.parse(String(init?.body)) as Record<string, unknown>,
      );
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: {
            delivered: ["customer@example.com"],
            queued: [],
            permanent_bounces: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    try {
      const result = await sendTransactionalEmail(testMessage());
      assert.equal(result.sent, true);
      assert.equal(result.configured, true);
      assert.deepEqual(requestBodies[0]?.from, {
        name: "Aijou AI",
        address: "otp@aijoutek.pro",
      });
      assert.equal(requestBodies[0]?.to, "customer@example.com");
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  test("Cloudflare success without an accepted recipient fails closed", async () => {
    const restore = setCloudflareTestEnvironment();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: { delivered: [], queued: [], permanent_bounces: [] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    try {
      const result = await sendTransactionalEmail(testMessage());
      assert.equal(result.sent, false);
      assert.equal(result.configured, true);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });
});

function testMessage() {
  return {
    to: "customer@example.com",
    subject: "Kode OTP Aijou",
    text: "123456",
    html: "<strong>123456</strong>",
    idempotencyKey: "otp-test-1",
  };
}

function setCloudflareTestEnvironment() {
  const keys = [
    "EMAIL_PROVIDER",
    "EMAIL_FROM",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_EMAIL_API_TOKEN",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.EMAIL_PROVIDER = "cloudflare";
  process.env.EMAIL_FROM = "Aijou AI <otp@aijoutek.pro>";
  process.env.CLOUDFLARE_ACCOUNT_ID = "account-id";
  process.env.CLOUDFLARE_EMAIL_API_TOKEN = "api-token";
  return () => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}
