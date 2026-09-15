import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync("src/components/app-shell.tsx", "utf8");
const collapsibleWorkspace = readFileSync("src/components/collapsible-app-workspace.tsx", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");
const conversations = readFileSync("src/app/conversations/page.tsx", "utf8");
const broadcasts = readFileSync("src/app/broadcasts/page.tsx", "utf8");
const messageTemplatesPage = readFileSync("src/app/message-templates/page.tsx", "utf8");
const liveConversation = readFileSync("src/components/live-conversation-detail.tsx", "utf8");
const conversationWorkspace = readFileSync("src/components/conversation-workspace.tsx", "utf8");
const modeControls = readFileSync("src/components/conversation-mode-controls.tsx", "utf8");
const opsModal = readFileSync("src/components/ops-modal.tsx", "utf8");
const newChatLauncher = readFileSync("src/components/new-whatsapp-chat-launcher.tsx", "utf8");
const backgroundJobs = readFileSync("src/server/jobs/background-jobs.ts", "utf8");
const conversationsServer = readFileSync("src/server/conversations/conversations.ts", "utf8");
const broadcastServer = readFileSync("src/server/operations/broadcasts.ts", "utf8");
const operationForms = [
  "broadcasts",
  "complaints",
  "customers",
  "orders",
  "shipping",
  "workflows",
].map((page) => readFileSync(`src/app/${page}/page.tsx`, "utf8"));
const styles = readFileSync("src/app/globals.css", "utf8");
const messageTemplateBuilder = readFileSync("src/components/message-template-builder.tsx", "utf8");
const messageTemplateServer = readFileSync("src/server/message-templates/message-templates.ts", "utf8");
const messageTemplateActions = readFileSync("src/app/message-templates/actions.ts", "utf8");
const whatsappTemplates = readFileSync("src/server/whatsapp/templates.ts", "utf8");

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
  assert.doesNotMatch(appShell, /label: "Butuh bantuan tim"/);
});

test("workspace typography and controls remain comfortably readable", () => {
  assert.match(layout, /Plus_Jakarta_Sans/);
  assert.match(styles, /font-family: var\(--font-app\)/);
  assert.match(styles, /\.primary-sidebar-item,[\s\S]*?min-height: 44px/);
  assert.match(styles, /\.app-main input[\s\S]*?min-height: 44px/);
});

test("keeps the application sidebar usable as a persistent icon rail", () => {
  assert.match(appShell, /CollapsibleAppWorkspace/);
  assert.match(appShell, /preferenceKey=\{`aijou:settings-sidebar-collapsed:/);
  assert.match(appShell, /title=\{item\.label\}/);
  assert.match(collapsibleWorkspace, /className="settings-sidebar-toggle"/);
  assert.match(collapsibleWorkspace, /ChevronLeft/);
  assert.match(collapsibleWorkspace, /ChevronRight/);
  assert.match(collapsibleWorkspace, /data-tooltip=\{toggleLabel\}/);
  assert.doesNotMatch(collapsibleWorkspace, /title=\{toggleLabel\}/);
  assert.match(collapsibleWorkspace, /localStorage/);
  assert.match(collapsibleWorkspace, /function getServerSidebarPreference\(\) \{\s+return false;/s);
  assert.match(styles, /\.app-workspace-sidebar-collapsed/);
  assert.match(styles, /\.settings-sidebar-collapsed \.settings-nav-item span/);
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

test("keeps inbox search focused and hides specific status filters behind a disclosure", () => {
  assert.match(conversations, /className="chat-inbox-filter-details"/);
  assert.match(conversations, /Filter spesifik/);
  assert.match(conversations, /name="q"/);
  assert.match(conversations, /className="chat-filter-advanced-form"/);
});

test("keeps inbox resizing separate from the intentional collapse control", () => {
  assert.match(conversationWorkspace, /role="separator"/);
  assert.match(conversationWorkspace, /className="chat-resizer-collapse"/);
  assert.match(conversationWorkspace, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(conversationWorkspace, /Sembunyikan daftar percakapan/);
});

test("gives slow chat actions immediate feedback and queues WhatsApp delivery", () => {
  assert.match(newChatLauncher, /onClick=\{\(\) => setOpen\(true\)\}/);
  assert.match(newChatLauncher, /pendingLabel="Membuka chat…"/);
  assert.match(opsModal, /FormSubmitButton/);
  assert.match(conversationsServer, /enqueueWhatsAppOutbound/);
  assert.match(conversationsServer, /scheduleWhatsAppOutboundWakeup/);
  assert.match(backgroundJobs, /const whatsAppOutboundJob = "WHATSAPP_OUTBOUND"/);
  assert.match(backgroundJobs, /deliverStoredWhatsAppTemplateMessage/);
});

test("keeps broadcasts manual, consent-aware, and restricted to Meta-approved templates", () => {
  assert.match(broadcasts, /name="phoneNumbers"/);
  assert.match(broadcasts, /ApprovedWhatsAppTemplatePicker/);
  assert.match(broadcastServer, /requireApprovedMetaWhatsAppTemplate/);
  assert.match(broadcastServer, /isMarketingContactEligible/);
  assert.match(messageTemplateBuilder, /name="headerImage"/);
  assert.match(messageTemplateServer, /BLOB_READ_WRITE_TOKEN/);
  assert.match(messageTemplateActions, /submitMessageTemplate/);
  assert.match(messageTemplateActions, /submitError/);
  assert.match(messageTemplateActions, /updateMessageTemplate/);
  assert.match(messageTemplateActions, /updateError/);
  assert.match(messageTemplatesPage, /Ajukan ke Meta/);
  assert.match(messageTemplatesPage, /submitError/);
  assert.match(messageTemplatesPage, /updateError/);
  assert.match(messageTemplatesPage, /Edit draft/);
  assert.match(messageTemplateBuilder, /Simpan perubahan/);
  assert.doesNotMatch(messageTemplateBuilder, /name="title"[^>]*disabled/);
  assert.match(messageTemplateBuilder, /useState\(initialTemplate\?\.body/);
  assert.match(whatsappTemplates, /message_templates/);
  assert.match(whatsappTemplates, /header_handle/);
  assert.match(whatsappTemplates, /whatsapp_templates_credentials_failed/);
});
