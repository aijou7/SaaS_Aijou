import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("unified knowledge management", () => {
  test("exposes one complete knowledge destination", async () => {
    const [shell, legacyPage, knowledgePage] = await Promise.all([
      source("../src/components/app-shell.tsx"),
      source("../src/app/training/page.tsx"),
      source("../src/app/knowledge/page.tsx"),
    ]);

    assert.match(shell, /href: "\/knowledge", label: "Knowledge"/);
    assert.doesNotMatch(shell, /Knowledge lanjutan/);
    assert.match(legacyPage, /redirect\("\/knowledge"\)/);
    assert.match(knowledgePage, /importTextKnowledgeAction/);
    assert.match(knowledgePage, /syncWebsiteKnowledgeAction/);
    assert.match(knowledgePage, /updateKnowledgeBaseAction/);
  });

  test("requires confirmation for templates and permanent deletion", async () => {
    const [page, confirmation] = await Promise.all([
      source("../src/app/knowledge/page.tsx"),
      source("../src/components/confirm-submit-button.tsx"),
    ]);

    assert.match(page, /ConfirmSubmitButton/);
    assert.match(page, /Tambahkan template/);
    assert.match(page, /Hapus permanen/);
    assert.match(confirmation, /window\.confirm\(confirmation\)/);
  });

  test("deletes tenant-scoped entries instead of only disabling them", async () => {
    const knowledge = await source("../src/server/knowledge/knowledge-base.ts");
    const deletion = knowledge.slice(
      knowledge.indexOf("export async function deleteKnowledgeBaseEntry"),
      knowledge.indexOf("export async function createKnowledgeTemplate"),
    );

    assert.match(deletion, /knowledgeBase\.deleteMany/);
    assert.match(deletion, /businessId: business\.id/);
    assert.doesNotMatch(deletion, /isActive: false/);
  });
});
