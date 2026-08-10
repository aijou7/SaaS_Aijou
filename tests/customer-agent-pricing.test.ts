import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildActiveProductPromptContext,
  buildPublishedPriceReply,
  extractKnowledgePriceOffers,
} from "../src/lib/customer-pricing";
import {
  extractWebsiteKnowledgeContent,
  extractWebsiteStartingPrices,
  isPublicIpAddress,
} from "../src/server/knowledge/website-sync";

const catalog = [
  {
    name: "Instalasi WiFi Basic",
    description: "Pemasangan awal untuk satu area kecil.",
    price: 350_000,
    currency: "IDR",
  },
  {
    name: "Website Company Profile",
    description: "Website profil bisnis dengan halaman inti.",
    price: 5_000_000,
    currency: "IDR",
  },
];

describe("published pricing grounding", () => {
  test("marks catalog prices as approved public starting prices", () => {
    const context = buildActiveProductPromptContext(catalog);

    assert.match(context, /Produk\/layanan: Instalasi WiFi Basic/);
    assert.match(context, /Harga publik: mulai dari Rp\s*350\.000/);
    assert.match(context, /bukan quotation final/);
  });

  test("answers a matching catalog price directly without an AI provider", () => {
    const reply = buildPublishedPriceReply({
      message: "Berapa harga instalasi wifi basic?",
      products: catalog,
    });

    assert.match(reply ?? "", /Instalasi WiFi Basic/);
    assert.match(reply ?? "", /Rp\s*350\.000/);
    assert.match(reply ?? "", /harga awal/i);
    assert.doesNotMatch(reply ?? "", /Website Company Profile/);
  });

  test("uses recent conversation context for a follow-up price question", () => {
    const reply = buildPublishedPriceReply({
      message: "Kalau harganya berapa?",
      conversationContext: "Customer: Saya tertarik Website Company Profile",
      products: catalog,
    });

    assert.match(reply ?? "", /Website Company Profile/);
    assert.match(reply ?? "", /Rp\s*5\.000\.000/);
  });

  test("does not mistake a stated budget for a request for a catalog price", () => {
    const reply = buildPublishedPriceReply({
      message: "Budget saya sekitar 250 juta untuk jaringan villa",
      conversationContext: "Customer: Saya butuh instalasi wifi",
      products: catalog,
    });

    assert.equal(reply, null);
  });

  test("does not substitute unrelated catalog prices for an unknown survey fee", () => {
    const reply = buildPublishedPriceReply({
      message: "Apakah ada biaya survei teknisi?",
      conversationContext: [
        "Customer: Saya mau pasang router untuk gedung dua lantai",
        "Assistant: Kami bisa bantu survei lokasi.",
      ].join("\n"),
      products: catalog,
    });

    assert.equal(reply, null);
  });

  test("reads structured starting prices synchronized from official knowledge", () => {
    const knowledge = [
      "Harga publik yang terdeteksi:",
      "- Discovery sprint — Mulai dari Rp3 juta",
      "- Focused MVP — Mulai dari Rp12 juta",
    ].join("\n");
    const offers = extractKnowledgePriceOffers(knowledge);
    const reply = buildPublishedPriceReply({
      message: "Focused MVP mulai berapa harganya?",
      knowledgeContext: knowledge,
    });

    assert.deepEqual(
      offers.map((offer) => [offer.label, offer.displayPrice]),
      [
        ["Discovery sprint", "Mulai dari Rp3 juta"],
        ["Focused MVP", "Mulai dari Rp12 juta"],
      ],
    );
    assert.match(reply ?? "", /Focused MVP/);
    assert.match(reply ?? "", /Rp12 juta/);
  });
});

describe("official website knowledge extraction", () => {
  const html = `
    <html>
      <head><style>.hidden { display: none }</style></head>
      <body>
        <h1>Teknologi yang bekerja</h1>
        <p>Kami merancang software, automation, dan infrastructure untuk bisnis.</p>
        <h3>Discovery sprint</h3>
        <p>Memetakan workflow dan requirement sebelum development.</p>
        <strong>Mulai Rp3 juta</strong>
        <h3>Focused MVP</h3>
        <p>Satu alur utama yang siap diuji pengguna.</p>
        <strong>Mulai Rp12 juta</strong>
        <script>ignoreThisSecretPrice("Rp999 juta")</script>
      </body>
    </html>
  `;

  test("extracts semantic starting prices and visible website text", () => {
    const prices = extractWebsiteStartingPrices(html);
    const result = extractWebsiteKnowledgeContent(html, "https://aijoutek.pro/");

    assert.deepEqual(prices, [
      { label: "Discovery sprint", displayPrice: "Mulai dari Rp3 juta" },
      { label: "Focused MVP", displayPrice: "Mulai dari Rp12 juta" },
    ]);
    assert.match(result.content, /- Focused MVP — Mulai dari Rp12 juta/);
    assert.doesNotMatch(result.content, /ignoreThisSecretPrice/);
  });

  test("rejects private and reserved targets used for SSRF", () => {
    assert.equal(isPublicIpAddress("127.0.0.1"), false);
    assert.equal(isPublicIpAddress("10.10.0.5"), false);
    assert.equal(isPublicIpAddress("169.254.169.254"), false);
    assert.equal(isPublicIpAddress("::1"), false);
    assert.equal(isPublicIpAddress("2606:4700:4700::1111"), true);
    assert.equal(isPublicIpAddress("1.1.1.1"), true);
  });
});
