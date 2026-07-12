import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalAccessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
const originalGraphVersion = process.env.WHATSAPP_GRAPH_API_VERSION;
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const { sendWhatsAppTextMessage } = await import("../src/server/whatsapp/client");

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("WHATSAPP_ACCESS_TOKEN", originalAccessToken);
  restoreEnv("WHATSAPP_PHONE_NUMBER_ID", originalPhoneNumberId);
  restoreEnv("WHATSAPP_GRAPH_API_VERSION", originalGraphVersion);
});

process.on("exit", () => restoreEnv("DATABASE_URL", originalDatabaseUrl));

describe("WhatsApp Graph client", () => {
  test("does not report a 2xx response without a provider message id as sent", async () => {
    configureCredentials();
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    const result = await sendWhatsAppTextMessage({
      to: "+62 812-3456-7890",
      body: "Halo",
    });

    assert.equal(result.sent, false);
    assert.equal(result.reason, "whatsapp_provider_message_id_missing");
  });

  test("reports accepted only when Meta returns a provider id", async () => {
    configureCredentials();
    process.env.WHATSAPP_GRAPH_API_VERSION = "23.0";
    let requestedUrl = "";
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.accepted" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await sendWhatsAppTextMessage({
      to: "6281234567890",
      body: "Halo",
    });

    assert.equal(result.sent, true);
    assert.equal(result.providerMessageId, "wamid.accepted");
    assert.match(requestedUrl, /\/v23\.0\/123456789\/messages$/);
  });

  test("rejects invalid recipients before making a network request", async () => {
    configureCredentials();
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(null, { status: 500 });
    };

    const result = await sendWhatsAppTextMessage({ to: "abc", body: "Halo" });

    assert.equal(result.sent, false);
    assert.equal(result.reason, "whatsapp_recipient_invalid");
    assert.equal(fetchCalls, 0);
  });
});

function configureCredentials() {
  process.env.WHATSAPP_ACCESS_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
