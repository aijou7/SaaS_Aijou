import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const conversations = readFileSync("src/app/conversations/page.tsx", "utf8");
const liveConversation = readFileSync("src/components/live-conversation-detail.tsx", "utf8");
const modeControls = readFileSync("src/components/conversation-mode-controls.tsx", "utf8");
const opsModal = readFileSync("src/components/ops-modal.tsx", "utf8");
const operationForms = [
  "broadcasts",
  "complaints",
  "customers",
  "orders",
  "shipping",
  "workflows",
].map((page) => readFileSync(`src/app/${page}/page.tsx`, "utf8"));
const styles = readFileSync("src/app/globals.css", "utf8");

test("workspace keeps five primary tasks on top and contextual submenus on the left", () => {
  for (const label of [
    "Percakapan",
    "AI & Knowledge",
    "Customer & Penjualan",
    "Otomatisasi",
    "Pengaturan",
  ]) {
    assert.match(appShell, new RegExp(`label: \"${label.replace("&", "&")}\"`));
  }
  assert.match(appShell, /<nav className="workspace-primary-nav"/);
  assert.doesNotMatch(appShell, /<nav className="primary-sidebar-nav"/);
  assert.match(appShell, /sidebar-context-heading/);
  assert.match(appShell, /<nav className="settings-nav"/);
});

test("workspace typography and controls remain comfortably readable", () => {
  assert.match(layout, /Plus_Jakarta_Sans/);
  assert.match(styles, /font-family: var\(--font-app\)/);
  assert.match(styles, /\.primary-sidebar-item,[\s\S]*?min-height: 44px/);
  assert.match(styles, /\.app-main input[\s\S]*?min-height: 44px/);
});

test("conversation view prioritizes the message thread and hides secondary actions", () => {
  for (const source of [conversations, liveConversation]) {
    assert.match(source, /chat-detail-body/);
    assert.match(source, /chat-conversation-column/);
    assert.match(source, /chat-context-panel/);
  }
  assert.match(modeControls, /conversation-more-menu/);
  assert.match(modeControls, /primaryMode/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) 300px/);
});

test("data-entry dialogs stay anchored to the viewport and scroll internally", () => {
  const appMainInnerRule = styles.match(/\.app-main-inner\s*\{[^}]*\}/)?.[0];

  assert.ok(appMainInnerRule);
  assert.doesNotMatch(appMainInnerRule, /animation:|transform:/);
  assert.match(styles, /\.ops-modal\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\)/s);
  assert.match(styles, /\.ops-modal-body\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.ops-modal-footer\s*\{/);
  assert.doesNotMatch(styles, /\.ops-modal-backdrop\s*\{[^}]*backdrop-filter:/s);
  assert.match(styles, /body:has\(\.ops-modal-backdrop\)[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.product-modal\s*\{[^}]*max-height:\s*calc\(100dvh - 48px\)/s);
  assert.match(styles, /\.product-modal-backdrop\s*\{[^}]*overflow-y:\s*auto/s);
});

test("operational forms share a fixed header, scrollable body, and fixed action area", () => {
  assert.match(opsModal, /className="ops-modal-head"/);
  assert.match(opsModal, /className="ops-modal-body"/);
  assert.match(opsModal, /className="ops-modal-footer"/);
  assert.match(opsModal, /aria-modal="true"/);

  for (const form of operationForms) {
    assert.match(form, /<OpsModal/);
    assert.doesNotMatch(form, /<div className="ops-modal-backdrop"/);
  }
});
