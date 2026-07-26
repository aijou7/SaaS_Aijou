export type PublicCatalogItem = {
  name: string;
  description: string | null;
  price: number;
  currency: string;
};

type PublishedPriceOffer = {
  label: string;
  displayPrice: string;
  source: "catalog" | "knowledge";
};

export function buildActiveProductPromptContext(products: PublicCatalogItem[]) {
  if (products.length === 0) {
    return "Belum ada katalog aktif. Jangan mengarang produk, paket, atau harga.";
  }

  return products
    .map((product) => {
      const price = formatCatalogPrice(product.price, product.currency);
      return [
        `Produk/layanan: ${product.name}`,
        product.description ? `Deskripsi: ${product.description}` : null,
        `Harga publik: mulai dari ${price}`,
        "Status harga: harga awal katalog, bukan quotation final",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n")
    .slice(0, 16_000);
}

export function buildPublishedPriceReply(params: {
  message: string;
  conversationContext?: string;
  knowledgeContext?: string;
  products?: PublicCatalogItem[];
}) {
  if (!isPricingQuestion(params.message)) {
    return null;
  }

  const offers = [
    ...(params.products ?? []).map((product) => ({
      label: product.name,
      displayPrice: `mulai dari ${formatCatalogPrice(product.price, product.currency)}`,
      source: "catalog" as const,
    })),
    ...extractKnowledgePriceOffers(params.knowledgeContext ?? ""),
  ];
  const uniqueOffers = deduplicateOffers(offers);

  if (uniqueOffers.length === 0) {
    return null;
  }

  const latestQuery = normalizeSearchText(params.message);
  const fullQuery = normalizeSearchText(
    `${params.conversationContext?.slice(-3_000) ?? ""}\n${params.message}`,
  );
  const ranked = uniqueOffers
    .map((offer) => ({
      offer,
      score: scoreOfferMatch(offer.label, latestQuery, fullQuery),
    }))
    .sort((left, right) => right.score - left.score);
  const relevant = ranked.filter((item) => item.score > 0).slice(0, 3);
  const selected =
    relevant.length > 0
      ? relevant.map((item) => item.offer)
      : shouldListPublishedPrices(latestQuery)
        ? uniqueOffers.slice(0, 3)
        : [];

  if (selected.length === 0) {
    return null;
  }

  if (selected.length === 1) {
    const [offer] = selected;
    return `Untuk ${offer.label}, harga publiknya ${offer.displayPrice}. Itu harga awal, bukan quotation final; totalnya mengikuti scope, integrasi, jumlah, atau kondisi lapangan yang relevan. Kalau mau, ceritakan kebutuhan intinya supaya saya bantu petakan langkah yang paling pas.`;
  }

  const priceList = selected
    .map((offer) => `${offer.label} ${offer.displayPrice}`)
    .join("; ");
  return `Harga mulai yang dipublikasikan: ${priceList}. Semuanya merupakan harga awal untuk scope paling fokus, bukan quotation final. Ceritakan kebutuhan utama kamu, nanti saya bantu arahkan paket atau tahap yang paling relevan.`;
}

export function extractKnowledgePriceOffers(
  knowledgeContext: string,
): PublishedPriceOffer[] {
  const offers: PublishedPriceOffer[] = [];
  const structuredPricePattern =
    /^[-*]\s*(.{2,120}?)\s+(?:—|–|\|)\s*((?:(?:harga\s+publik(?:nya)?\s*)?(?:mulai(?:\s+dari)?|start(?:ing)?(?:\s+from)?)\s*(?:rp|idr)\s*[\d.,]+\s*(?:ribu|rb|juta|jt|miliar)?))/i;

  for (const rawLine of knowledgeContext.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const match = line.match(structuredPricePattern);
    if (!match) continue;

    const label = match[1].replace(/^harga\s+(?:untuk\s+)?/i, "").trim();
    const displayPrice = match[2]
      .replace(/^harga\s+publik(?:nya)?\s*/i, "")
      .replace(/^mulai\s+(?!dari\b)/i, "mulai dari ")
      .trim();

    if (label && displayPrice) {
      offers.push({ label, displayPrice, source: "knowledge" });
    }
  }

  return offers;
}

function isPricingQuestion(message: string) {
  return /\b(?:harga|harganya|biaya|tarif|price|pricing|rate|quotation|penawaran|estimasi|mulai\s+dari|start(?:ing)?\s+from)\b/i.test(
    message,
  );
}

function formatCatalogPrice(price: number, currency: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(price);
}

function deduplicateOffers(offers: PublishedPriceOffer[]) {
  const seen = new Set<string>();
  return offers.filter((offer) => {
    const key = `${normalizeSearchText(offer.label)}:${normalizeSearchText(offer.displayPrice)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreOfferMatch(label: string, latestQuery: string, fullQuery: string) {
  const normalizedLabel = normalizeSearchText(label);
  if (!normalizedLabel) return 0;
  if (latestQuery.includes(normalizedLabel)) return 200;
  if (fullQuery.includes(normalizedLabel)) return 120;

  const tokens = normalizedLabel
    .split(" ")
    .filter((token) => token.length >= 3 && !priceMatchStopWords.has(token));

  return tokens.reduce((score, token) => {
    if (latestQuery.includes(token)) return score + 30;
    if (fullQuery.includes(token)) return score + 12;
    return score;
  }, 0);
}

function shouldListPublishedPrices(query: string) {
  const remainingTerms = query
    .split(" ")
    .filter((token) => token.length >= 3 && !priceQueryStopWords.has(token));

  return remainingTerms.length === 0;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const priceMatchStopWords = new Set([
  "jasa",
  "layanan",
  "paket",
  "produk",
  "service",
]);

const priceQueryStopWords = new Set([
  "berapa",
  "harga",
  "harganya",
  "biaya",
  "tarif",
  "price",
  "pricing",
  "rate",
  "quotation",
  "penawaran",
  "estimasi",
  "budget",
  "mulai",
  "dari",
  "untuk",
  "jasa",
  "layanan",
  "produk",
  "paket",
  "kalian",
  "kamu",
  "anda",
  "semua",
  "daftar",
  "apa",
  "aja",
  "yang",
  "ada",
  "dong",
  "nih",
]);
