import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  getTelegramBotIdentity,
  sendTelegramTextMessage,
  setTelegramWebhook,
} from "../src/server/telegram/client";
import {
  compactTelegramUpdate,
  extractTelegramInboundMessage,
  normalizeTelegramChatId,
  telegramProviderMessageId,
} from "../src/server/telegram/payload";
import {
  hashTelegramWebhookKey,
  isValidTelegramWebhookKey,
  telegramSecretHeader,
  verifyTelegramWebhookSecret,
} from "../src/server/telegram/security";

const originalFetch = globalThis.fetch;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const validBotToken = `123456789:${"A".repeat(32)}`;
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const { buildTelegramWebhookUrl } = await import("../src/server/telegram/settings");

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("NEXT_PUBLIC_APP_URL", originalAppUrl);
});

process.on("exit", () => restoreEnv("DATABASE_URL", originalDatabaseUrl));

describe("Telegram payload parsing", () => {
  test("extracts only bounded private human text and compacts metadata without message text", () => {
    const extracted = extractTelegramInboundMessage({
      update_id: 987,
      message: {
        message_id: 42,
        chat: { id: 628123, type: "private" },
        from: {
          id: 628123,
          is_bot: false,
          first_name: "  Aijou   Test  ",
          last_name: " User ",
          username: "aijou_test",
        },
        text: `  ${"x".repeat(5_000)}  `,
      },
    });

    assert.ok(extracted);
    assert.equal(extracted.chatId, "628123");
    assert.equal(extracted.displayName, "Aijou Test User");
    assert.equal(extracted.username, "aijou_test");
    assert.equal(extracted.text.length, 4_096);

    const compact = compactTelegramUpdate(extracted);
    assert.equal(compact.channel, "TELEGRAM");
    assert.equal(compact.updateId, "987");
    assert.equal("text" in compact, false);
  });

  test("ignores groups, bot-authored messages, non-text updates, and unsafe identifiers", () => {
    const baseMessage = {
      message_id: 42,
      chat: { id: 628123, type: "private" },
      from: { id: 628123, is_bot: false, first_name: "Tester" },
      text: "Halo",
    };

    assert.equal(
      extractTelegramInboundMessage({
        update_id: 1,
        message: { ...baseMessage, chat: { id: -100123, type: "group" } },
      }),
      null,
    );
    assert.equal(
      extractTelegramInboundMessage({
        update_id: 1,
        message: { ...baseMessage, from: { id: 628123, is_bot: true } },
      }),
      null,
    );
    assert.equal(
      extractTelegramInboundMessage({
        update_id: 1,
        message: { ...baseMessage, text: undefined },
      }),
      null,
    );
    assert.equal(
      extractTelegramInboundMessage({
        update_id: Number.MAX_SAFE_INTEGER + 1,
        message: baseMessage,
      }),
      null,
    );
  });

  test("normalizes chat and provider identifiers deterministically", () => {
    assert.equal(normalizeTelegramChatId(" 628123 "), "628123");
    assert.equal(normalizeTelegramChatId("0"), "");
    assert.equal(normalizeTelegramChatId("12.3"), "");
    assert.equal(
      telegramProviderMessageId("123456789", "987"),
      "telegram:123456789:update:987",
    );
  });
});

describe("Telegram webhook security", () => {
  test("validates opaque webhook keys and secrets without loose comparison", () => {
    const key = "a".repeat(32);
    const secret = "Webhook_secret-123";

    assert.equal(telegramSecretHeader, "x-telegram-bot-api-secret-token");
    assert.equal(isValidTelegramWebhookKey(key), true);
    assert.equal(isValidTelegramWebhookKey("short"), false);
    assert.equal(isValidTelegramWebhookKey(`${"a".repeat(31)}!`), false);
    assert.match(hashTelegramWebhookKey(key), /^[a-f0-9]{64}$/);
    assert.equal(verifyTelegramWebhookSecret(secret, secret), true);
    assert.equal(verifyTelegramWebhookSecret(secret, `${secret}x`), false);
    assert.equal(verifyTelegramWebhookSecret(secret, null), false);
  });

  test("builds a canonical HTTPS webhook without putting the bot token in its URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/ignored/path";
    const key = "b".repeat(43);

    assert.equal(
      buildTelegramWebhookUrl(key),
      `https://app.example.com/api/webhooks/telegram/${key}`,
    );
    assert.doesNotMatch(buildTelegramWebhookUrl(key), new RegExp(validBotToken));

    process.env.NEXT_PUBLIC_APP_URL = "http://app.example.com";
    assert.throws(() => buildTelegramWebhookUrl(key), /HTTPS/);
  });
});

describe("Telegram Bot API client", () => {
  test("rejects invalid input locally without spending a provider request", async () => {
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(null, { status: 500 });
    };

    assert.deepEqual(await sendTelegramTextMessage({
      botToken: validBotToken,
      chatId: "invalid",
      text: "Halo",
    }), {
      sent: false,
      reason: "telegram_chat_id_invalid",
      status: null,
    });
    assert.equal(
      (
        await sendTelegramTextMessage({
          botToken: validBotToken,
          chatId: "628123",
          text: "x".repeat(4_097),
        })
      ).reason,
      "telegram_message_too_long",
    );
    assert.equal(
      (
        await sendTelegramTextMessage({
          botToken: "not-a-token",
          chatId: "628123",
          text: "Halo",
        })
      ).reason,
      "telegram_bot_token_invalid",
    );
    assert.equal(fetchCalls, 0);
  });

  test("requires a provider message id before reporting an outbound message as sent", async () => {
    globalThis.fetch = async () =>
      jsonResponse({ ok: true, result: {} });

    const result = await sendTelegramTextMessage({
      botToken: validBotToken,
      chatId: "628123",
      text: "Halo",
    });

    assert.equal(result.sent, false);
    assert.equal(result.reason, "telegram_provider_message_id_missing");
  });

  test("validates bot identity and registers a narrow webhook without exposing the token", async () => {
    const requests: Array<{ url: string; payload: Record<string, unknown> }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ url, payload });

      if (url.endsWith("/getMe")) {
        return jsonResponse({
          ok: true,
          result: { id: 123456789, is_bot: true, username: "aijou_beta_bot", first_name: "Aijou" },
        });
      }
      return jsonResponse({ ok: true, result: true });
    };

    const identity = await getTelegramBotIdentity(`  ${validBotToken}  `);
    assert.equal(identity.ok, true);
    if (identity.ok) assert.equal(identity.bot.username, "aijou_beta_bot");
    assert.equal(
      requests[0].url,
      `https://api.telegram.org/bot${validBotToken}/getMe`,
    );

    const webhook = await setTelegramWebhook({
      botToken: validBotToken,
      webhookUrl: "https://app.example.com/api/webhooks/telegram/opaque-key",
      webhookSecret: "secret-key",
    });
    assert.equal(webhook.ok, true);
    assert.deepEqual(requests[1].payload.allowed_updates, ["message"]);
    assert.equal(requests[1].payload.max_connections, 20);
    assert.equal(requests[1].payload.drop_pending_updates, false);

    globalThis.fetch = async () =>
      jsonResponse(
        { ok: false, description: `invalid token ${validBotToken}` },
        401,
      );
    const rejected = await getTelegramBotIdentity(validBotToken);
    assert.equal(rejected.ok, false);
    assert.doesNotMatch(JSON.stringify(rejected), new RegExp(validBotToken));
  });

  test("bounds provider response bodies and retry hints", async () => {
    globalThis.fetch = async () =>
      jsonResponse(
        { ok: false, parameters: { retry_after: 99_999 } },
        429,
      );
    const limited = await sendTelegramTextMessage({
      botToken: validBotToken,
      chatId: "628123",
      text: "Halo",
    });
    assert.equal(limited.sent, false);
    assert.equal(limited.reason, "telegram_rate_limited");
    assert.equal(limited.retryAfterSeconds, 3_600);

    globalThis.fetch = async () => new Response("x".repeat(64 * 1_024 + 1), { status: 200 });
    const oversized = await getTelegramBotIdentity(validBotToken);
    assert.equal(oversized.ok, false);
    assert.equal(oversized.reason, "telegram_api_rejected");
  });
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
