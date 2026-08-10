export type RetrievalEntry = {
  id?: string;
  title: string;
  content: string;
  category?: string | null;
  sourceType?: string | null;
  priority?: number | null;
  updatedAt?: Date | string | null;
};

const stopWords = new Set([
  "ada", "adalah", "agar", "aja", "akan", "aku", "anda", "apa", "atau",
  "bagi", "bisa", "buat", "dari", "dan", "dengan", "di", "dong", "gua",
  "ingin", "ini", "itu", "jadi", "jika", "kalau", "kami", "kamu", "ke",
  "karena", "lebih", "mau", "mohon", "oleh", "pada", "pakai", "perlu",
  "saya", "sebuah", "sih", "sudah", "supaya", "tentang", "tidak", "untuk",
  "yang",
]);

export function rankRelevantKnowledge<T extends RetrievalEntry>(
  entries: readonly T[],
  query: string,
  limit = 12,
) {
  const queryTokens = tokenize(query);
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: relevanceScore(entry, queryTokens),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map(({ entry }) => entry);
}

function relevanceScore(entry: RetrievalEntry, queryTokens: Set<string>) {
  const priority = Math.max(0, Math.min(100, entry.priority ?? 80));
  if (queryTokens.size === 0) return priority;

  const titleTokens = tokenize(`${entry.title} ${entry.category ?? ""}`);
  const contentTokens = tokenize(entry.content);
  let matches = 0;
  for (const token of queryTokens) {
    if (titleTokens.has(token)) matches += 7;
    else if (contentTokens.has(token)) matches += 3;
  }

  const exactPhrase = normalize(entry.content).includes(
    [...queryTokens].join(" "),
  )
    ? 8
    : 0;
  return matches * 100 + exactPhrase + priority;
}

function tokenize(value: string) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !stopWords.has(token))
      .slice(0, 120),
  );
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
