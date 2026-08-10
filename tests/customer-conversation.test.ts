import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildContextAwareFallback,
  buildContextualCustomerReply,
  buildDerivedConversationContext,
  buildOperationalFollowUpReply,
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

  test("keeps a greeting short and human", () => {
    const reply = buildContextualCustomerReply({
      message: "halo bro",
      agentName: "Aijou",
    });

    assert.equal(reply, "Halo, ada yang bisa saya bantu?");
  });

  test("does not resolve stretched greetings from an unrelated old topic", () => {
    const conversationContext = [
      "Customer: saya mau buat website",
      "Assistant: Untuk versi awal, websitenya bisa berisi profil dan layanan.",
      "Customer: alamatnya di mana?",
      "Assistant: Lokasi bisnis berada di Lombok.",
    ].join("\n");

    for (const message of ["haloo", "halooo", "hallooo", "haiii", "hiii"]) {
      const reply = buildContextualCustomerReply({
        message,
        conversationContext,
        agentName: "Aijou",
      });

      assert.equal(reply, "Iya, saya di sini. Mau tanya apa?");
      assert.doesNotMatch(reply ?? "", /lokasi|website|konteks|sudah saya catat/i);
    }
  });

  test("answers consecutive greetings without restarting or repeating the old context", () => {
    const reply = buildContextualCustomerReply({
      message: "halo!!!",
      conversationContext: [
        "Customer: halooo",
        "Assistant: Iya, saya di sini. Mau tanya apa?",
      ].join("\n"),
      agentName: "Aijou",
    });

    assert.equal(reply, "Masih di sini. Kirim saja pertanyaannya.");
  });

  test("delegates business-specific website scope to the grounded model", () => {
    const reply = buildContextualCustomerReply({
      message: "saya mau buat website",
      conversationContext:
        "Customer: halo\nAssistant: Halo, ada yang bisa saya bantu?",
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("delegates dashboard scope to approved business context", () => {
    const reply = buildContextualCustomerReply({
      message: "Saya butuh custom dashboard",
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("lets the model resolve an open-ended answer from current context", () => {
    const reply = buildContextualCustomerReply({
      message: "aku gapunya ide",
      conversationContext:
        "Customer: saya butuh website company profile\nAssistant: Sudah ada ide desainnya?",
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("delegates 'keduanya' to the immediately preceding model context", () => {
    const reply = buildContextualCustomerReply({
      message: "keduanya",
      conversationContext: websiteConversation,
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("does not hardcode the meaning of a context-dependent answer", () => {
    const reply = buildContextualCustomerReply({
      message: "keduanya",
      conversationContext: [
        "Customer: saya butuh website company profile",
        "Assistant: Untuk website company profile, struktur awalnya mencakup profil, produk, dan layanan. Apakah perusahaan sudah punya logo dan panduan warna?",
      ].join("\n"),
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("does not hardcode a one-month delivery promise", () => {
    const reply = buildContextualCustomerReply({
      message: "1 bulan bisa?",
      conversationContext: `${websiteConversation}\nCustomer: keduanya\nAssistant: Siap, berarti dua fungsi itu masuk scope.`,
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("lets conversation history resolve a timeline answer", () => {
    const reply = buildContextualCustomerReply({
      message: "bulan depan",
      conversationContext: `${websiteConversation}\nAssistant: Kapan targetnya?`,
      agentName: "Aijou",
    });

    assert.equal(reply, null);
  });

  test("continues a router diagnostic when the customer says 'boleh'", () => {
    const reply = buildContextualCustomerReply({
      message: "boleh",
      conversationContext: [
        "Customer: kurang paham untuk update dan jenis wifinya",
        "Assistant: Router Anda mungkin menggunakan WiFi 5. Saya bisa membantu Anda memeriksa router Anda secara online jika Anda mau.",
      ].join("\n"),
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /merek dan model router/i);
    assert.match(reply ?? "", /jenis WiFi, versi firmware, dan langkah update/i);
    assert.match(reply ?? "", /jangan kirim password/i);
    assert.doesNotMatch(reply ?? "", /tambahkan sedikit detail|sudah saya catat/i);
    assert.doesNotMatch(reply ?? "", /memeriksa router.*secara online/i);
  });

  test("does not guess a WiFi generation without the router model", () => {
    const reply = buildContextualCustomerReply({
      message: "kurang paham untuk update dan jenis wifinya",
      conversationContext:
        "Customer: Router ini sudah lama dipakai di kantor.",
      agentName: "Aijou",
    });

    assert.match(reply ?? "", /belum bisa dipastikan tanpa model perangkat/i);
    assert.match(reply ?? "", /hardware revision/i);
    assert.match(reply ?? "", /firmware resmi/i);
    assert.doesNotMatch(reply ?? "", /mungkin menggunakan WiFi 5/i);
  });

  test("provider fallback preserves known context", () => {
    const fallback = buildContextAwareFallback({
      message: "oke lanjut",
      conversationContext: `${websiteConversation}\nCustomer: keduanya\nAssistant: Siap, dua fungsi masuk scope.`,
      agentName: "Aijou",
    });

    assert.match(fallback, /website company profile/i);
    assert.match(fallback, /detail sebelumnya tetap tersimpan/i);
    assert.doesNotMatch(fallback, /konteks.*sudah.*catat/i);
    assert.doesNotMatch(fallback, /^halo/i);
  });

  test("records a requested survey slot without pretending it is confirmed", () => {
    const decision = buildOperationalFollowUpReply({
      message: "Jl Amir Hamzah no 2, untuk besok jam 10 pagi bisa ya?",
      conversationContext: [
        "Customer: Bisa langsung survei ke lokasi?",
        "Assistant: Bisa. Kirim alamat dan waktu kunjungan yang diinginkan.",
      ].join("\n"),
    });

    assert.match(decision?.reply ?? "", /besok pukul 10\.00/i);
    assert.match(decision?.reply ?? "", /belum final/i);
    assert.match(decision?.handoffReason ?? "", /jadwal survei/i);
    assert.doesNotMatch(decision?.reply ?? "", /dapat melakukan|jadwal.*(?:sudah|berhasil).*dikonfirmasi/i);
  });

  test("uses the current WhatsApp number for survey coordination", () => {
    const decision = buildOperationalFollowUpReply({
      message: "nomor whatsappnya yang saya gunakan ini",
      conversationContext: [
        "Customer: Saya minta survei besok jam 10.",
        "Assistant: Nomor mana yang bisa dipakai untuk koordinasi kunjungan?",
      ].join("\n"),
    });

    assert.match(decision?.reply ?? "", /nomor WhatsApp ini/i);
    assert.match(decision?.reply ?? "", /setelah tim mengonfirmasi/i);
  });

  test("understands a short confirmation as the answer to the visit details", () => {
    const decision = buildOperationalFollowUpReply({
      message: "ya tepat",
      conversationContext: [
        "Customer: Saya minta survei di Jl Amir Hamzah besok jam 10.",
        "Assistant: Apakah alamat dan waktu tersebut sudah tepat?",
      ].join("\n"),
    });

    assert.match(decision?.reply ?? "", /detail alamat dan waktunya sudah benar/i);
    assert.match(decision?.reply ?? "", /konfirmasi final/i);
  });

  test("routes an undocumented survey fee to the team without inventing a policy", () => {
    const decision = buildOperationalFollowUpReply({
      message: "apakah ada biaya survei?",
      conversationContext: "Assistant: Kami bisa mengatur kunjungan teknisi ke lokasi.",
    });

    assert.match(decision?.reply ?? "", /belum tercantum/i);
    assert.match(decision?.reply ?? "", /tidak akan menebak/i);
    assert.doesNotMatch(decision?.reply ?? "", /tidak terpisah|quotation akhir/i);
  });

  test("strips repeat greetings and previously asked questions", () => {
    const reply = polishCustomerReply({
      reply:
        "Halo! Saya paham targetnya. Apakah websitenya untuk informasi perusahaan atau promosi produk dan layanan?",
      conversationContext: websiteConversation,
      fallback: "Konteksnya tetap saya catat.",
    });

    assert.equal(reply, "Konteksnya tetap saya catat.");
  });

  test("removes generic marketing filler and keeps the useful answer", () => {
    const reply = polishCustomerReply({
      reply:
        "Membuat website adalah langkah yang tepat untuk meningkatkan visibilitas bisnis Anda. Untuk versi awal, gunakan struktur Beranda, Layanan, Portofolio, dan Kontak. Apakah websitenya untuk company profile atau penjualan? Pertanyaan kedua yang tidak perlu?",
      fallback: "Bisa, saya bantu petakan websitenya.",
    });

    assert.equal(
      reply,
      "Untuk versi awal, gunakan struktur Beranda, Layanan, Portofolio, dan Kontak. Apakah websitenya untuk company profile atau penjualan?",
    );
    assert.doesNotMatch(reply, /visibilitas|langkah yang tepat/i);
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
