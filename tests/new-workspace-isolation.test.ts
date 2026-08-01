import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("new workspace isolation", () => {
  test("public and invite signup share the same empty bootstrap", async () => {
    const [publicSignup, betaInvites] = await Promise.all([
      source("../src/server/auth/public-signup.ts"),
      source("../src/server/auth/beta-invites.ts"),
    ]);

    assert.match(publicSignup, /createEmptyOwnedWorkspace\(tx,/);
    assert.match(betaInvites, /createEmptyOwnedWorkspace\(tx,/);
  });

  test("bootstrap creates access records but no customer or demo data", async () => {
    const bootstrap = await source("../src/server/auth/workspace-bootstrap.ts");
    const required = ["business", "agentSettings", "workspaceMembership", "activationEvent"];
    const forbidden = [
      "contact",
      "whatsAppConversation",
      "transaction",
      "knowledgeBase",
      "product",
      "quickReply",
      "lead",
      "customerSegment",
      "complaint",
      "broadcastCampaign",
      "order",
      "shippingRate",
      "automationWorkflow",
      "whatsAppSettings",
      "telegramSettings",
    ];

    for (const model of required) {
      assert.match(bootstrap, new RegExp(`tx\\.${model}\\.create\\(`));
    }
    for (const model of forbidden) {
      assert.doesNotMatch(bootstrap, new RegExp(`tx\\.${model}\\.(?:create|upsert|createMany)\\(`));
    }
    assert.match(bootstrap, /businessType:\s*null/);
  });

  test("verified owners land on a clean dashboard before setup", async () => {
    const [verification, inviteSignup, dashboard, snapshot] = await Promise.all([
      source("../src/app/verify-email/actions.ts"),
      source("../src/app/signup/actions.ts"),
      source("../src/app/dashboard/page.tsx"),
      source("../src/server/finance/dashboard.ts"),
    ]);

    assert.match(verification, /redirect\("\/dashboard\?welcome=1&emailVerified=1"\)/);
    assert.match(inviteSignup, /redirect\("\/dashboard\?welcome=1"\)/);
    assert.match(dashboard, /dashboard\.isWorkspaceEmpty/);
    assert.match(dashboard, /belum berisi chat, customer, lead, produk, transaksi/);
    assert.match(snapshot, /workspaceRecordCount/);
  });
});
