import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildContextAwareFallback,
  buildContextualCustomerReply,
  buildDerivedConversationContext,
  polishCustomerReply,
} from "../src/lib/customer-conversation";

const websiteConversation = [
  "Customer: kalo bikin website profile ada ga?",
  "Assistant: Ya, kami dapat membantu membuat website profile. Apakah Anda memiliki ide tentang desain dan fiturnya?",
  "Customer: aku gapunya ide",
  "Assistant: Tidak masalah. Kita bisa mulai dari struktur dasar. Perusahaannya bergerak di bidang apa?",
  "Customer: perusahaan saya perbankan, kalau dibikinin preview design bisa ga?",
  "Assistant: Bisa. Apakah websitenya untuk informasi perusahaan atau promosi produk dan layanan?",
].join("\n");

describe("customer conversation continuity", () => {
  test("answers AI identity questions directly without another greeting", () => {
    const reply = buildContextualCustomerReply({
      message: "apakah ini yang membalas AI?",
      conversationContext:
        "Customer: Saya butuh custom dashboard\nAssistant: Boleh, dashboardnya akan dipakai oleh siapa?",
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /sedang ngobrol dengan Aijou, asisten AI/i);
    assert.doesNotMatch(reply ?? "", /^halo/i);
  });

  test("proposes a starting point when the customer has no idea", () => {
    const reply = buildContextualCustomerReply({
      message: "aku gapunya ide",
      conversationContext:
        "Customer: saya butuh website company profile\nAssistant: Sudah ada ide desainnya?",
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /mulai dari nol/i);
    assert.match(reply ?? "", /beranda.*profil perusahaan.*produk atau layanan/i);
    assert.doesNotMatch(reply ?? "", /^halo/i);
  });

  test("treats 'keduanya' as the previous either-or answer", () => {
    const reply = buildContextualCustomerReply({
      message: "keduanya",
      conversationContext: websiteConversation,
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /dua fungsi/i);
    assert.match(reply ?? "", /profil dan kredibilitas/i);
    assert.match(reply ?? "", /produk atau layanan/i);
    assert.doesNotMatch(reply ?? "", /apakah websitenya untuk/i);
  });

  test("resolves 'keduanya' from a logo-and-color question", () => {
    const reply = buildContextualCustomerReply({
      message: "keduanya",
      conversationContext: [
        "Customer: saya butuh website company profile",
        "Assistant: Apakah perusahaan sudah punya logo dan panduan warna?",
      ].join("\n"),
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /logo dan panduan warna sudah ada/i);
    assert.doesNotMatch(reply ?? "", /dua fungsi/i);
    assert.doesNotMatch(reply ?? "", /sekaligus memperkenalkan produk/i);
  });

  test("answers one-month feasibility using the known project", () => {
    const reply = buildContextualCustomerReply({
      message: "1 bulan bisa?",
      conversationContext: `${websiteConversation}\nCustomer: keduanya\nAssistant: Siap, berarti dua fungsi itu masuk scope.`,
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /cukup realistis/i);
    assert.match(reply ?? "", /website company profile/i);
    assert.match(reply ?? "", /preview desain/i);
  });

  test("records 'bulan depan' without restarting discovery", () => {
    const reply = buildContextualCustomerReply({
      message: "bulan depan",
      conversationContext: `${websiteConversation}\nAssistant: Kapan targetnya?`,
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /targetnya bulan depan sudah saya catat/i);
    assert.doesNotMatch(reply ?? "", /ceritakan kebutuhan/i);
  });

  test("provider fallback preserves known context", () => {
    const fallback = buildContextAwareFallback({
      message: "oke lanjut",
      conversationContext: `${websiteConversation}\nCustomer: keduanya\nAssistant: Siap, dua fungsi masuk scope.`,
      agentName: "Aijou",
    });

    assert.match(fallback, /website company profile/i);
    assert.match(fallback, /bukan mengulang dari awal/i);
    assert.doesNotMatch(fallback, /^halo/i);
  });

  test("strips repeat greetings and previously asked questions", () => {
    const reply = polishCustomerReply({
      reply:
        "Halo! Saya paham targetnya. Apakah websitenya untuk informasi perusahaan atau promosi produk dan layanan?",
      conversationContext: websiteConversation,
      fallback: "Konteksnya tetap saya catat.",
    });

    assert.equal(reply, "Saya paham targetnya.");
  });

  test("exposes durable facts to the model prompt", () => {
    const context = buildDerivedConversationContext(
      "bulan depan",
      `${websiteConversation}\nCustomer: keduanya`,
    );

    assert.match(context, /website company profile/i);
    assert.match(context, /Industri: perbankan/i);
    assert.match(context, /profil perusahaan sekaligus promosi/i);
    assert.match(context, /Target waktu: bulan depan/i);
  });
});
