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

    assert.match(sessionSource, /business:\s*user\.businesses\[0\]\s*\?\?\s*null/);
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
});
