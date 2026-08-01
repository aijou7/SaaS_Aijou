import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import {
  getMarketingFeatureGroups,
  marketingFeatureCategories,
  marketingFeatures,
} from "../src/lib/marketing-features";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("public feature navigation", () => {
  test("lists the production-ready feature set without Xendit", () => {
    const slugs = marketingFeatures.map((feature) => feature.slug);

    assert.equal(new Set(slugs).size, slugs.length);
    assert.deepEqual(marketingFeatureCategories, [
      "Percakapan",
      "Pelanggan",
      "AI & Otomasi",
      "Operasional",
    ]);
    assert.deepEqual(
      [
        "web-live-chat",
        "telegram-ai",
        "segmentasi-pelanggan",
        "manajemen-komplain",
        "jam-kerja-ai",
        "workflow-builder",
        "broadcast-whatsapp",
        "produk-katalog",
        "manajemen-order",
        "cek-ongkir",
      ].filter((slug) => !slugs.includes(slug)),
      [],
    );
    assert.doesNotMatch(JSON.stringify(marketingFeatures), /Xendit|order-pembayaran/i);
  });

  test("keeps every navigation entry linked to a detail page", () => {
    const grouped = getMarketingFeatureGroups().flatMap((group) => group.features);

    assert.equal(grouped.length, marketingFeatures.length);
    assert.deepEqual(
      grouped.map((feature) => feature.slug).sort(),
      marketingFeatures.map((feature) => feature.slug).sort(),
    );
  });

  test("uses an accessible mega-menu and a separate feature directory", async () => {
    const [landing, navigation, directory] = await Promise.all([
      source("../src/app/page.tsx"),
      source("../src/components/marketing-navigation.tsx"),
      source("../src/app/features/page.tsx"),
    ]);

    assert.match(landing, /<MarketingHeader \/>/);
    assert.doesNotMatch(landing, /marketing-feature-directory/);
    assert.match(navigation, /aria-expanded=\{featuresOpen\}/);
    assert.match(navigation, /event\.key !== "Escape"/);
    assert.match(navigation, /href=\{`\/features\/\$\{feature\.slug\}`\}/);
    assert.match(directory, /features-index-directory/);
  });
});
