import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { evaluateAiResponseQuality } from "../src/lib/ai-response-quality";
import {
  buildContextAwareFallback,
  buildContextualCustomerReply,
  polishCustomerReply,
} from "../src/lib/customer-conversation";

const realConversation = [
  "Customer: Saya butuh custom dashboard",
  "AI: Dashboard awalnya bisa mencakup KPI utama dan role-based access. Dashboard ini dipakai tim apa?",
  "Customer: perusahaan saya perbankan",
  "AI: Preview desain bisa dibuat untuk profil perusahaan dan promosi layanan. Fokusnya salah satu atau keduanya?",
  "Customer: keduanya",
  "AI: Berarti scope awal mencakup profil perusahaan sekaligus halaman produk dan layanan.",
].join("\n");

describe("AI reply regression quality gate", () => {
  test("rejects repeated greetings, generic filler, and repeated questions", () => {
    const result = evaluateAiResponseQuality({
      reply:
        "Halo! Saya paham. Membuat website adalah langkah yang tepat untuk meningkatkan visibilitas bisnis. Fokusnya salah satu atau keduanya?",
      conversationContext: realConversation,
    });
    assert.equal(result.passed, false);
    assert.ok(result.violations.includes("generic_filler"));
    assert.ok(result.violations.includes("repeated_greeting"));
    assert.ok(result.violations.includes("repeated_question"));
  });

  test("accepts a concise contextual answer with at most one next question", () => {
    const reply =
      "Satu bulan realistis untuk versi awal: company profile, halaman produk/layanan, preview desain, dan CMS dasar. Apakah materi brand perbankannya sudah tersedia?";
    const result = evaluateAiResponseQuality({
      reply,
      conversationContext: realConversation,
    });
    assert.equal(result.passed, true);
    assert.ok(result.score >= 70);
    assert.equal(result.questionCount, 1);
  });

  test("rejects unsupported claims of remote router access", () => {
    const result = evaluateAiResponseQuality({
      reply:
        "Saya bisa membantu memeriksa router Anda secara online jika Anda mau.",
      conversationContext:
        "Customer: Saya kurang paham cara update firmware router.",
    });

    assert.equal(result.passed, false);
    assert.ok(result.violations.includes("unsupported_remote_access"));
  });

  test("rejects the old generic acknowledgement fallback", () => {
    const result = evaluateAiResponseQuality({
      reply:
        "Oke, jawabanmu sudah saya catat. Bisa tambahkan sedikit detail tentang bagian yang paling penting?",
      conversationContext: "Assistant: Saya bisa bantu mengeceknya jika Anda mau.",
    });

    assert.equal(result.passed, false);
    assert.ok(result.violations.includes("generic_filler"));
  });

  test("deterministic short follow-ups pass the same quality gate", () => {
    const cases = [
      buildContextualCustomerReply({
        message: "keduanya",
        conversationContext: realConversation,
        agentName: "Aijou",
      }),
      buildContextualCustomerReply({
        message: "1 bulan bisa?",
        conversationContext: realConversation,
        agentName: "Aijou",
      }),
      buildContextAwareFallback({
        message: "lanjut",
        conversationContext: realConversation,
        agentName: "Aijou",
      }),
      polishCustomerReply({
        reply:
          "Membuat website adalah langkah yang tepat untuk meningkatkan visibilitas bisnis. Scope awalnya profil, produk, layanan, dan CMS.",
        conversationContext: realConversation,
        fallback: "Scope awalnya profil, produk, layanan, dan CMS.",
      }),
    ].filter((value): value is string => Boolean(value));

    for (const reply of cases) {
      const result = evaluateAiResponseQuality({
        reply,
        conversationContext: realConversation,
      });
      assert.equal(
        result.passed,
        true,
        `${reply}: ${result.violations.join(", ")}`,
      );
    }
  });
});
