import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canWorkspace,
  getWorkspaceHome,
  isWorkspaceReadOnly,
  type WorkspaceCapability,
} from "../src/lib/workspace-permissions";

const capabilities: WorkspaceCapability[] = [
  "account:view",
  "ai:view",
  "ai:manage",
  "automation:manage",
  "dashboard:view",
  "finance:view",
  "inbox:view",
  "inbox:operate",
  "operations:view",
  "operations:operate",
  "sales:view",
  "sales:operate",
  "team:manage",
  "workspace:manage",
];

test("Owner and Admin can operate the whole workspace", () => {
  for (const capability of capabilities) {
    assert.equal(canWorkspace("OWNER", capability), true, capability);
    assert.equal(canWorkspace("ADMIN", capability), true, capability);
  }
});

test("Agent lands in inbox and can operate customers without changing configuration", () => {
  assert.equal(getWorkspaceHome("AGENT"), "/conversations");
  assert.equal(canWorkspace("AGENT", "inbox:operate"), true);
  assert.equal(canWorkspace("AGENT", "sales:operate"), true);
  assert.equal(canWorkspace("AGENT", "operations:operate"), true);
  assert.equal(canWorkspace("AGENT", "ai:manage"), false);
  assert.equal(canWorkspace("AGENT", "automation:manage"), false);
  assert.equal(canWorkspace("AGENT", "finance:view"), false);
  assert.equal(canWorkspace("AGENT", "team:manage"), false);
});

test("Viewer has useful read access and no operational capability", () => {
  assert.equal(getWorkspaceHome("VIEWER"), "/dashboard");
  assert.equal(isWorkspaceReadOnly("VIEWER"), true);
  for (const capability of [
    "dashboard:view",
    "inbox:view",
    "ai:view",
    "sales:view",
    "finance:view",
    "operations:view",
  ] as WorkspaceCapability[]) {
    assert.equal(canWorkspace("VIEWER", capability), true, capability);
  }
  for (const capability of [
    "inbox:operate",
    "sales:operate",
    "operations:operate",
    "ai:manage",
    "automation:manage",
    "team:manage",
    "workspace:manage",
  ] as WorkspaceCapability[]) {
    assert.equal(canWorkspace("VIEWER", capability), false, capability);
  }
});

test("role-aware shell filters navigation and redirects inaccessible direct URLs", () => {
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const conversations = readFileSync("src/app/conversations/page.tsx", "utf8");
  const liveConversation = readFileSync("src/components/live-conversation-detail.tsx", "utf8");

  assert.match(shell, /canWorkspace\(workspaceRole, item\.capability\)/);
  assert.match(shell, /redirect\(getWorkspaceHome\(workspaceRole\)\)/);
  assert.match(shell, /workspace-role-badge/);
  assert.match(conversations, /const readOnly = session\.role === "VIEWER"/);
  assert.match(liveConversation, /Viewer dapat membaca riwayat chat/);
});

test("shared read models include members while mutations retain role guards", () => {
  const dashboard = readFileSync("src/server/finance/dashboard.ts", "utf8");
  const transactions = readFileSync("src/server/finance/transactions.ts", "utf8");
  const products = readFileSync("src/server/products/catalog.ts", "utf8");
  const payments = readFileSync("src/server/payments/payments.ts", "utf8");
  const receipts = readFileSync("src/server/receipts/receipt-flow.ts", "utf8");

  assert.match(dashboard, /activeWorkspaceAccessWhere\(userId\)/);
  for (const source of [transactions, products, payments, receipts]) {
    assert.match(source, /where: await activeWorkspaceAccessWhere\(userId\)/);
    assert.match(source, /WorkspaceRole\.OWNER, WorkspaceRole\.ADMIN/);
  }
});
