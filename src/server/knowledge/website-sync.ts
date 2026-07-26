import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { invalidateTtlCache } from "@/lib/ttl-cache";

const websiteKnowledgeCategory = "website-sync";
const maximumWebsiteBytes = 512 * 1024;
const maximumWebsiteKnowledgeChars = 36_000;

export async function syncBusinessWebsiteKnowledge(userId: string) {
  const { prisma } = await import("@/lib/prisma");
  const business = await prisma.business.findFirst({
    where: { userId },
    select: {
      id: true,
      websiteUrl: true,
    },
  });

  if (!business) {
    throw new Error("Business belum dibuat.");
  }
  if (!business.websiteUrl) {
    throw new Error("Isi URL website di Business Profile terlebih dahulu.");
  }

  const sourceUrl = new URL(business.websiteUrl);
  const { html, finalUrl } = await fetchPublicWebsiteHtml(sourceUrl);
  const extracted = extractWebsiteKnowledgeContent(html, finalUrl.href);
  const title = `Website resmi — ${finalUrl.hostname}`;

  const entry = await prisma.$transaction(async (tx) => {
    const existing = await tx.knowledgeBase.findFirst({
      where: {
        businessId: business.id,
        category: websiteKnowledgeCategory,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (existing) {
      return tx.knowledgeBase.update({
        where: { id: existing.id },
        data: {
          title,
          content: extracted.content,
          isActive: true,
        },
      });
    }

    return tx.knowledgeBase.create({
      data: {
        businessId: business.id,
        title,
        category: websiteKnowledgeCategory,
        content: extracted.content,
        isActive: true,
      },
    });
  });

  invalidateTtlCache(`knowledge-context:${business.id}`);

  return {
    entryId: entry.id,
    priceCount: extracted.prices.length,
    contentChars: extracted.content.length,
    websiteUrl: finalUrl.origin,
  };
}

export function extractWebsiteKnowledgeContent(html: string, sourceUrl: string) {
  const safeHtml = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const prices = extractWebsiteStartingPrices(safeHtml);
  const visibleText = decodeHtmlEntities(
    safeHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:h[1-6]|p|li|article|section|div|header|footer|nav)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  const priceSection =
    prices.length > 0
      ? [
          "Harga publik yang terdeteksi:",
          ...prices.map((item) => `- ${item.label} — ${item.displayPrice}`),
        ].join("\n")
      : "Tidak ada harga mulai yang terdeteksi secara terstruktur.";
  const content = [
    `Sumber website resmi: ${sourceUrl}`,
    priceSection,
    "Konten publik website:",
    visibleText,
  ]
    .join("\n\n")
    .slice(0, maximumWebsiteKnowledgeChars);

  if (visibleText.length < 80) {
    throw new Error("Konten website terlalu sedikit atau tidak dapat dibaca.");
  }

  return { content, prices };
}

export function extractWebsiteStartingPrices(html: string) {
  const prices: Array<{ label: string; displayPrice: string }> = [];
  const seen = new Set<string>();
  const semanticElementPattern =
    /<(h[1-6]|strong|b|p|span)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let currentHeading = "";
  let match: RegExpExecArray | null;

  while ((match = semanticElementPattern.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    const text = stripHtml(match[2]);
    if (!text) continue;

    if (tagName.startsWith("h")) {
      currentHeading = text.slice(0, 120);
      continue;
    }

    const price = text.match(
      /\b(?:mulai(?:\s+dari)?|start(?:ing)?(?:\s+from)?)\s*(?:rp|idr)\s*[\d.,]+\s*(?:ribu|rb|juta|jt|miliar)?\b/i,
    )?.[0];
    if (!price || !currentHeading) continue;

    const normalizedPrice = price
      .replace(/^mulai\s+(?!dari\b)/i, "Mulai dari ")
      .replace(/^mulai\s+dari/i, "Mulai dari")
      .replace(/^start(?:ing)?\s+from/i, "Mulai dari")
      .trim();
    const key = `${currentHeading.toLowerCase()}:${normalizedPrice.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    prices.push({
      label: currentHeading,
      displayPrice: normalizedPrice,
    });
  }

  return prices.slice(0, 20);
}

async function fetchPublicWebsiteHtml(initialUrl: URL) {
  let currentUrl = new URL(initialUrl);
  const originalHostname = stripWww(initialUrl.hostname);

  for (let redirectCount = 0; redirectCount <= 2; redirectCount += 1) {
    await assertPublicHttpsUrl(currentUrl);
    const response = await fetch(currentUrl, {
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-encoding": "identity",
        "user-agent": "Aijou-Website-Knowledge-Sync/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === 2) {
        throw new Error("Redirect website tidak valid atau terlalu banyak.");
      }
      const nextUrl = new URL(location, currentUrl);
      if (stripWww(nextUrl.hostname) !== originalHostname) {
        throw new Error("Redirect website menuju domain lain dan diblokir.");
      }
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) {
      throw new Error(`Website merespons HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error("URL website tidak mengembalikan halaman HTML.");
    }

    const html = await readBoundedResponse(response, maximumWebsiteBytes);
    return { html, finalUrl: currentUrl };
  }

  throw new Error("Website tidak dapat disinkronkan.");
}

async function assertPublicHttpsUrl(url: URL) {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Sinkronisasi website hanya menerima URL HTTPS publik.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("Hostname website tidak diizinkan.");
  }

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (
    addresses.length === 0 ||
    addresses.some((entry) => !isPublicIpAddress(entry.address))
  ) {
    throw new Error("Website harus mengarah ke alamat IP publik.");
  }
}

export function isPublicIpAddress(address: string) {
  const normalized = address.toLowerCase();

  if (normalized.startsWith("::ffff:")) {
    return isPublicIpAddress(normalized.slice("::ffff:".length));
  }

  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split(".").map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 2) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0)
    );
  }

  if (isIP(normalized) === 6) {
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("2001:db8:")
    );
  }

  return false;
}

async function readBoundedResponse(response: Response, maximumBytes: number) {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maximumBytes) {
    throw new Error("Halaman website terlalu besar untuk disinkronkan.");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new Error("Halaman website terlalu besar untuk disinkronkan.");
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    ndash: "–",
    mdash: "—",
    times: "×",
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return namedEntities[code.toLowerCase()] ?? entity;
    },
  );
}

function stripWww(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
}
