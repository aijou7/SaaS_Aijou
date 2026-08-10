import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const conversations = readFileSync("src/app/conversations/page.tsx", "utf8");
const liveConversation = readFileSync("src/components/live-conversation-detail.tsx", "utf8");
const modeControls = readFileSync("src/components/conversation-mode-controls.tsx", "utf8");
const styles = readFileSync("src/app/globals.css", "utf8");

test("workspace navigation favors five clear task areas", () => {
  for (const label of [
    "Percakapan",
    "AI & Knowledge",
    "Customer & Penjualan",
    "Otomatisasi",
    "Pengaturan",
  ]) {
    assert.match(appShell, new RegExp(`label: \"${label.replace("&", "&")}\"`));
  }
  assert.doesNotMatch(appShell, /<nav className="top-nav"/);
  assert.match(appShell, /primary-sidebar-nav/);
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
