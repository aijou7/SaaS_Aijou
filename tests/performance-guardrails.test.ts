import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

describe("production performance guardrails", () => {
  test("keeps Vercel compute colocated with the Singapore database", async () => {
    const config = JSON.parse(
      await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    ) as { regions?: string[] };

    assert.deepEqual(config.regions, ["sin1"]);
  });

  test("reuses the workspace from the authenticated session on the inbox path", async () => {
    const [sessionSource, pageSource] = await Promise.all([
      readFile(new URL("../src/lib/session.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/app/conversations/page.tsx", import.meta.url), "utf8"),
    ]);

    assert.match(sessionSource, /const workspaceMap = new Map/);
    assert.match(
      sessionSource,
      /activeWorkspaceId \? workspaceMap\.get\(activeWorkspaceId\)/,
    );
    assert.match(pageSource, /getConversationsInboxForBusiness\(business,\s*inboxFilters\)/);
    assert.match(pageSource, /Promise\.all\(\[/);
    assert.match(pageSource, /liveState=\{inbox\.liveState\}/);
  });

  test("does not initialize quick replies on every conversation read", async () => {
    const source = await readFile(
      new URL("../src/server/quick-replies/quick-replies.ts", import.meta.url),
      "utf8",
    );
    const activeRead = source.slice(
      source.indexOf("export async function getActiveQuickRepliesForBusiness"),
      source.indexOf("export async function createQuickReply"),
    );

    assert.doesNotMatch(activeRead, /ensureDefaultQuickReplies/);
  });

  test("exposes server timing for the live inbox endpoint", async () => {
    const source = await readFile(
      new URL("../src/app/api/inbox/live/route.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /"Server-Timing"/);
    assert.match(source, /getInboxLiveStateForBusiness\(session\.business\.id\)/);
  });

  test("prefetches and caches only the conversation a user intends to open", async () => {
    const [pageSource, linkSource] = await Promise.all([
      readFile(new URL("../src/app/conversations/page.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../src/components/fast-conversation-link.tsx", import.meta.url),
        "utf8",
      ),
    ]);

    assert.match(pageSource, /<FastConversationLink/);
    assert.doesNotMatch(pageSource, /key=\{conversation\.id\}\s+prefetch/);
    assert.match(linkSource, /const detailCache = new Map/);
    assert.match(linkSource, /onMouseEnter=\{\(\) => void load\(\)\}/);
    assert.match(linkSource, /window\.history\.pushState/);
  });

  test("reuses the inbox briefly without hiding live updates", async () => {
    const source = await readFile(
      new URL("../src/server/conversations/conversations.ts", import.meta.url),
      "utf8",
    );

    assert.match(source, /ttlCache\(cacheKey,\s*3_500/);
    assert.match(source, /loadConversationsInboxForBusiness\(business,\s*filters\)/);
  });

  test("parallelizes independent primary menu loaders", async () => {
    const [agentSource, paymentsSource, knowledgeSource, trainingSource, shellSource] =
      await Promise.all([
        readFile(new URL("../src/app/agent/page.tsx", import.meta.url), "utf8"),
        readFile(new URL("../src/app/payments/page.tsx", import.meta.url), "utf8"),
        readFile(new URL("../src/app/knowledge/page.tsx", import.meta.url), "utf8"),
        readFile(new URL("../src/app/training/page.tsx", import.meta.url), "utf8"),
        readFile(new URL("../src/components/app-shell.tsx", import.meta.url), "utf8"),
      ]);

    assert.match(agentSource, /const \[page,\s*profile,\s*params\] = await Promise\.all/);
    assert.match(paymentsSource, /const \[page,\s*payments\] = await Promise\.all/);
    assert.match(knowledgeSource, /const \[session,\s*params\] = await Promise\.all/);
    assert.match(trainingSource, /redirect\("\/knowledge"\)/);
    assert.match(shellSource, /<IntentPrefetchLink/);
  });
});
