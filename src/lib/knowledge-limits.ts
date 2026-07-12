export const knowledgeTitleMaxChars = 160;
export const knowledgeCategoryMaxChars = 80;
export const knowledgeContentMaxChars = 40_000;
export const knowledgeImportMaxBytes = 64 * 1024;
export const knowledgePromptMaxChars = 24_000;

type KnowledgeTextInput = {
  title: string;
  content: string;
  category?: string | null;
};

export type KnowledgePromptEntry = {
  title: string;
  content: string;
  category?: string | null;
};

export function normalizeKnowledgeTextInput(input: KnowledgeTextInput) {
  const title = input.title.trim();
  const content = input.content.trim();
  const category = input.category?.trim() || undefined;

  if (!title || !content) {
    throw new Error("Title dan content wajib diisi.");
  }

  if (title.length > knowledgeTitleMaxChars) {
    throw new Error(`Title maksimal ${knowledgeTitleMaxChars} karakter.`);
  }

  if (category && category.length > knowledgeCategoryMaxChars) {
    throw new Error(`Category maksimal ${knowledgeCategoryMaxChars} karakter.`);
  }

  if (content.length > knowledgeContentMaxChars) {
    throw new Error(
      `Satu knowledge item maksimal ${knowledgeContentMaxChars.toLocaleString("id-ID")} karakter. Pecah dokumen menjadi beberapa item agar AI lebih mudah mengambil konteks yang relevan.`,
    );
  }

  return { title, content, category };
}

export function buildKnowledgePromptContext(
  entries: KnowledgePromptEntry[],
  maxChars = knowledgePromptMaxChars,
) {
  if (entries.length === 0 || maxChars <= 0) {
    return "";
  }

  const blocks = entries.map((entry) => {
    const title = entry.title.trim().slice(0, knowledgeTitleMaxChars) || "Untitled";
    const category = entry.category?.trim().slice(0, knowledgeCategoryMaxChars) || "general";
    const content = entry.content.trim().slice(0, knowledgeContentMaxChars);
    return [`Title: ${title}`, `Category: ${category}`, content].filter(Boolean).join("\n");
  });

  return fitBlocksWithinBudget(blocks, Math.floor(maxChars));
}

function fitBlocksWithinBudget(blocks: string[], maxChars: number) {
  const separator = "\n\n";
  const minimumUsefulBlockChars = 32;
  const maximumIncludedBlocks = Math.max(
    1,
    Math.floor((maxChars + separator.length) / (minimumUsefulBlockChars + separator.length)),
  );
  const includedBlocks = blocks.slice(0, maximumIncludedBlocks);
  const separatorBudget = separator.length * Math.max(0, includedBlocks.length - 1);
  const availableBudget = Math.max(0, maxChars - separatorBudget);
  const allocations = new Array<number>(includedBlocks.length).fill(0);
  let remainingBudget = availableBudget;
  let remainingIndexes = includedBlocks.map((_, index) => index);

  while (remainingIndexes.length > 0 && remainingBudget > 0) {
    const equalShare = Math.floor(remainingBudget / remainingIndexes.length);

    if (equalShare === 0) {
      break;
    }

    const completed = remainingIndexes.filter(
      (index) => includedBlocks[index].length <= equalShare,
    );

    if (completed.length === 0) {
      const remainder = remainingBudget % remainingIndexes.length;

      remainingIndexes.forEach((index, position) => {
        allocations[index] = equalShare + (position < remainder ? 1 : 0);
      });
      remainingBudget = 0;
      break;
    }

    for (const index of completed) {
      allocations[index] = includedBlocks[index].length;
      remainingBudget -= includedBlocks[index].length;
    }

    const completedSet = new Set(completed);
    remainingIndexes = remainingIndexes.filter((index) => !completedSet.has(index));
  }

  const context = includedBlocks
    .map((block, index) => truncateCleanly(block, allocations[index]))
    .filter(Boolean)
    .join(separator);

  return context.slice(0, maxChars);
}

function truncateCleanly(value: string, maxChars: number) {
  if (maxChars <= 0) {
    return "";
  }

  if (value.length <= maxChars) {
    return value;
  }

  if (maxChars <= 1) {
    return value.slice(0, maxChars);
  }

  return `${value.slice(0, maxChars - 1).trimEnd()}…`;
}
