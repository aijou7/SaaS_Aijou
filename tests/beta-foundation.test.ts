import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import {
  buildKnowledgePromptContext,
  knowledgeContentMaxChars,
  normalizeKnowledgeTextInput,
} from "../src/lib/knowledge-limits";
import { hashPassword, verifyPassword } from "../src/lib/password";
import {
  clearTtlCache,
  getTtlCacheStats,
  invalidateTtlCache,
  ttlCache,
} from "../src/lib/ttl-cache";
import { detectIntentFromText, extractExpenseFromText } from "../src/server/ai/intent";
import { extractMessages } from "../src/server/whatsapp/payload";

afterEach(() => {
  clearTtlCache();
});

describe("TTL cache", () => {
  test("coalesces concurrent cache misses and reuses the resolved value", async () => {
    let calls = 0;
    let resolveLoader: ((value: string) => void) | undefined;
    const loader = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        resolveLoader = resolve;
      });
    };

    const first = ttlCache("agent:one", 5_000, loader);
    const second = ttlCache("agent:one", 5_000, loader);
    await Promise.resolve();

    assert.equal(calls, 1);
    resolveLoader?.("ready");
    assert.deepEqual(await Promise.all([first, second]), ["ready", "ready"]);
    assert.equal(await ttlCache("agent:one", 5_000, loader), "ready");
    assert.equal(calls, 1);
  });

  test("invalidation prevents an old in-flight result from repopulating the cache", async () => {
    let resolveOld: ((value: string) => void) | undefined;
    const oldLoad = ttlCache(
      "knowledge:one",
      5_000,
      () =>
        new Promise<string>((resolve) => {
          resolveOld = resolve;
        }),
    );
    await Promise.resolve();

    invalidateTtlCache("knowledge:");
    const newLoad = ttlCache("knowledge:one", 5_000, async () => "fresh");
    resolveOld?.("stale");

    assert.equal(await oldLoad, "stale");
    assert.equal(await newLoad, "fresh");
    assert.equal(await ttlCache("knowledge:one", 5_000, async () => "unexpected"), "fresh");
  });

  test("does not cache rejected loads and allows the next request to recover", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;

      if (calls === 1) {
        throw new Error("temporary failure");
      }

      return "recovered";
    };

    await assert.rejects(ttlCache("recoverable", 5_000, load), /temporary failure/);
    assert.equal(getTtlCacheStats().inFlight, 0);
    assert.equal(await ttlCache("recoverable", 5_000, load), "recovered");
    assert.equal(calls, 2);
  });

  test("keeps the memory cache bounded", async () => {
    const maxEntries = getTtlCacheStats().maxEntries;

    for (let index = 0; index <= maxEntries; index += 1) {
      await ttlCache(`bounded:${index}`, 60_000, async () => index);
    }

    assert.equal(getTtlCacheStats().entries, maxEntries);
  });
});

describe("knowledge safety helpers", () => {
  test("normalizes valid input and rejects oversized content", () => {
    assert.deepEqual(
      normalizeKnowledgeTextInput({
        title: "  FAQ jaringan  ",
        category: " faq ",
        content: "  Survey dilakukan sebelum quotation.  ",
      }),
      {
        title: "FAQ jaringan",
        category: "faq",
        content: "Survey dilakukan sebelum quotation.",
      },
    );

    assert.throws(
      () =>
        normalizeKnowledgeTextInput({
          title: "Oversized",
          content: "x".repeat(knowledgeContentMaxChars + 1),
        }),
      /maksimal/,
    );
  });

  test("budgets prompt characters without a fixed item-count cutoff", () => {
    const entries = Array.from({ length: 30 }, (_, index) => ({
      title: `Knowledge ${index + 1}`,
      category: "faq",
      content: `Isi knowledge ${index + 1} `.repeat(20),
    }));
    const context = buildKnowledgePromptContext(entries, 4_000);

    assert.ok(context.length <= 4_000);
    for (const entry of entries) {
      assert.match(context, new RegExp(`Title: ${entry.title}`));
    }
  });

  test("returns useful bounded context even when the character budget is tiny", () => {
    const context = buildKnowledgePromptContext(
      [{ title: "FAQ", category: "general", content: "Jawaban yang panjang" }],
      12,
    );

    assert.ok(context.length > 0);
    assert.ok(context.length <= 12);
  });
});

describe("security and parsing helpers", () => {
  test("hashes passwords with a unique salt and rejects invalid credentials", async () => {
    const firstHash = await hashPassword("rahasia-beta");
    const secondHash = await hashPassword("rahasia-beta");

    assert.notEqual(firstHash, secondHash);
    assert.equal(await verifyPassword("rahasia-beta", firstHash), true);
    assert.equal(await verifyPassword("salah", firstHash), false);
    assert.equal(await verifyPassword("rahasia-beta", "invalid"), false);
  });

  test("extracts intent, Indonesian amounts, and WhatsApp business identifiers", () => {
    assert.equal(detectIntentFromText("catat beli kabel Rp450.000").intent, "expense_create");
    assert.equal(
      extractExpenseFromText("catat beli kabel 450 ribu", new Date("2026-07-11T00:00:00Z"))
        .totalAmount,
      450_000,
    );

    const messages = extractMessages({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: {
                  phone_number_id: "phone-id",
                  display_phone_number: "628123",
                },
                messages: [{ id: "message-id", from: "628999", type: "text" }],
              },
            },
          ],
        },
      ],
    });

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0].businessIdentifiers, ["phone-id", "628123"]);
  });
});
