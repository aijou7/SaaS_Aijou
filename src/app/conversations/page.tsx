import {
  Activity,
  BadgeCheck,
  Bell,
  Bot,
  CheckCircle,
  GitBranch,
  Mail,
  Megaphone,
  MessageCircle,
  Music2,
  RadioTower,
  Send,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateAgentSettingsAction } from "@/app/agent/actions";
import {
  assignConversationAction,
  sendOwnerReplyAction,
  sendWhatsAppTemplateAction,
  updateConversationNotesAction,
} from "@/app/conversations/actions";
import { updateWhatsAppSettingsAction } from "@/app/whatsapp/actions";
import { AppShell } from "@/components/app-shell";
import { ChatMessageThread } from "@/components/chat-message-thread";
import { ChatReplyComposer } from "@/components/chat-reply-composer";
import { ConversationModeControls } from "@/components/conversation-mode-controls";
import { InboxLiveRefresher } from "@/components/inbox-live-refresher";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { FastConversationLink } from "@/components/fast-conversation-link";
import { LiveConversationDetail } from "@/components/live-conversation-detail";
import { ConversationStatus } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { getAgentSettingsPage } from "@/server/agent/settings";
import {
  formatConversationStatus,
  getConversationDetail,
  getConversationDetailForBusiness,
  getConversationsInbox,
  getConversationsInboxForBusiness,
} from "@/server/conversations/conversations";
import type { InboxLiveState } from "@/lib/inbox-live";
import { isWhatsAppCustomerCareWindowOpen } from "@/lib/whatsapp-window";
import {
  getActiveQuickRepliesForBusiness,
  getActiveQuickRepliesForUser,
} from "@/server/quick-replies/quick-replies";
import { getWhatsAppSettingsPage } from "@/server/whatsapp/settings";

type ChatView =
  | "chat"
  | "analytics"
  | "conversations"
  | "ai-agents"
  | "platforms"
  | "flow"
  | "settings";

type ConversationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ConversationInbox = Awaited<ReturnType<typeof getConversationsInbox>>;
type ConversationDetail = Awaited<ReturnType<typeof getConversationDetail>>;
type AgentSettingsPageData = Awaited<ReturnType<typeof getAgentSettingsPage>>;
type QuickReplies = Awaited<ReturnType<typeof getActiveQuickRepliesForBusiness>>;
type WhatsAppSettingsPageData = Awaited<ReturnType<typeof getWhatsAppSettingsPage>>;

export default async function ConversationsPage({ searchParams }: ConversationsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const conversationId = getSearchParam(resolvedSearchParams, "conversationId");
  const status = getSearchParam(resolvedSearchParams, "status");
  const q = getSearchParam(resolvedSearchParams, "q");
  const unread = getSearchParam(resolvedSearchParams, "unread") === "1";
  const pageNumber = Math.max(1, Number(getSearchParam(resolvedSearchParams, "page") ?? 1) || 1);
  const historyLimit = normalizeHistoryLimit(getSearchParam(resolvedSearchParams, "history"));
  const currentView = normalizeChatView(getSearchParam(resolvedSearchParams, "view"));
  const business = session.business;

  const inboxFilters = { status, q, unread, page: pageNumber };
  const inboxPromise = business
    ? getConversationsInboxForBusiness(business, inboxFilters)
    : getConversationsInbox(session.userId, inboxFilters);

  if (currentView === "chat") {
    const [inbox, selectedConversation, quickReplies] = await Promise.all([
      inboxPromise,
      conversationId
        ? business
          ? getConversationDetailForBusiness(business.id, conversationId, historyLimit)
          : getConversationDetail(session.userId, conversationId)
        : Promise.resolve(null),
      conversationId
        ? business
          ? getActiveQuickRepliesForBusiness(business.id)
          : getActiveQuickRepliesForUser(session.userId)
        : Promise.resolve([]),
    ]);

    return (
      <AppShell active="conversations" businessName={inbox.business?.businessName}>
        <ChatInboxView
          inbox={inbox}
          liveState={inbox.liveState}
          q={q}
          quickReplies={quickReplies}
          selectedConversation={selectedConversation}
          status={status}
          unread={unread}
        />
      </AppShell>
    );
  }

  const needsAgentSettings = ["ai-agents", "flow", "settings"].includes(currentView);
  const needsWhatsAppSettings = ["platforms", "flow"].includes(currentView);
  const [inbox, agentPage, whatsAppPage] = await Promise.all([
    inboxPromise,
    needsAgentSettings ? getAgentSettingsPage(session.userId) : Promise.resolve(null),
    needsWhatsAppSettings ? getWhatsAppSettingsPage(session.userId) : Promise.resolve(null),
  ]);

  return (
    <AppShell active="conversations" businessName={inbox.business?.businessName}>
      <ChatFeaturePanel
        agentPage={agentPage}
        inbox={inbox}
        searchParams={resolvedSearchParams}
        view={currentView}
        whatsAppPage={whatsAppPage}
      />
    </AppShell>
  );
}

function ChatInboxView({
  inbox,
  liveState,
  q,
  quickReplies,
  selectedConversation,
  status,
  unread,
}: {
  inbox: ConversationInbox;
  liveState: InboxLiveState;
  q?: string;
  quickReplies: QuickReplies;
  selectedConversation: ConversationDetail;
  status?: string;
  unread?: boolean;
}) {
  return (
    <section className="chat-page">
      <aside className="chat-inbox">
        <InboxLiveRefresher initialState={liveState} />
        <form className="chat-filter-form" action="/conversations" method="get">
          <input
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Cari percakapan"
            maxLength={160}
            aria-label="Cari percakapan"
          />
          <div className="chat-filter-row">
            <select name="status" defaultValue={status ?? ""} aria-label="Status percakapan">
              <option value="">Semua status</option>
              {Object.values(ConversationStatus).map((option) => (
                <option key={option} value={option}>
                  {formatConversationStatus(option)}
                </option>
              ))}
            </select>
            <button className="ghost-button" type="submit" aria-label="Terapkan filter">Cari</button>
          </div>
          {unread ? <input name="unread" type="hidden" value="1" /> : null}
        </form>

        <div className="chat-tabs">
          <Link className={!unread && (!status || status !== "CLOSED") ? "active" : ""} href="/conversations">
            Aktif <span>{inbox.summary.open + inbox.summary.humanNeeded}</span>
          </Link>
          <Link className={unread ? "active" : ""} href="/conversations?unread=1">
            Belum dibaca <span>{inbox.summary.unread}</span>
          </Link>
          <Link className={status === "CLOSED" ? "active" : ""} href="/conversations?status=CLOSED">
            Selesai <span>{inbox.summary.closed}</span>
          </Link>
        </div>

        <ConversationTicketList
          inbox={inbox}
          q={q}
          selectedConversationId={selectedConversation?.id}
          status={status}
          unread={unread}
        />
        {inbox.pagination.pageCount > 1 ? (
          <div className="orders-pagination chat-pagination">
            {inbox.pagination.page > 1 ? (
              <Link href={buildInboxPageUrl({ q, status, unread, page: inbox.pagination.page - 1 })}>
                Sebelumnya
              </Link>
            ) : <span />}
            <small>{inbox.pagination.page}/{inbox.pagination.pageCount}</small>
            {inbox.pagination.page < inbox.pagination.pageCount ? (
              <Link href={buildInboxPageUrl({ q, status, unread, page: inbox.pagination.page + 1 })}>
                Berikutnya
              </Link>
            ) : <span />}
          </div>
        ) : null}
      </aside>

      <main className="chat-stage">
        <LiveConversationDetail
          initialDetail={selectedConversation}
          key={[
            selectedConversation?.id ?? "empty",
            selectedConversation?.status ?? "",
            selectedConversation?.assignedToUser?.id ?? "",
            selectedConversation?.messages.at(-1)?.id ?? "",
            selectedConversation?.messages.at(-1)?.deliveryStatus ?? "",
            selectedConversation?.ownerNotes ?? "",
          ].join(":")}
          initialPanel={
            !selectedConversation ? (
              <WelcomeChecklist />
            ) : (
              <ConversationDetailPanel
                quickReplies={quickReplies}
                selectedConversation={selectedConversation}
              />
            )
          }
          quickReplies={quickReplies}
        />
      </main>
    </section>
  );
}

function ConversationTicketList({
  inbox,
  q,
  selectedConversationId,
  status,
  unread,
}: {
  inbox: ConversationInbox;
  q?: string;
  selectedConversationId?: string;
  status?: string;
  unread?: boolean;
}) {
  return (
    <div className="chat-ticket-list">
      {inbox.conversations.length === 0 ? (
        <div className="chat-empty-ticket">
          <strong>Belum ada percakapan</strong>
          <span>Coba kirim pesan dari simulator atau channel yang sudah terhubung.</span>
        </div>
      ) : (
        inbox.conversations.map((conversation) => (
          <FastConversationLink
            className={selectedConversationId === conversation.id ? "chat-ticket active" : "chat-ticket"}
            conversationId={conversation.id}
            href={buildInboxPageUrl({
              conversationId: conversation.id,
              q,
              status,
              unread,
              page: inbox.pagination.page,
            })}
            key={conversation.id}
          >
            <div className="ticket-heading">
              <strong>{conversation.contactName}</strong>
              <time>{formatInboxDate(conversation.lastMessageAt)}</time>
            </div>
            <p>{conversation.lastMessage || "Conversation assigned..."}</p>
            <div className="ticket-meta">
              <span className="channel-dot" aria-hidden="true" />
              <span>{formatChannelLabel(conversation.channel, conversation.lead?.source)}</span>
              {conversation.status === "HUMAN_NEEDED" ? (
                <span className="mini-badge pending">Butuh tim</span>
              ) : null}
              {conversation.unreadCount > 0 ? (
                <span className="count-badge" aria-label={`${conversation.unreadCount} belum dibaca`}>
                  {conversation.unreadCount}
                </span>
              ) : null}
            </div>
          </FastConversationLink>
        ))
      )}
    </div>
  );
}

/* Previous layout retained temporarily during the task-first inbox rollout.
function LegacyConversationDetailPanel({
  quickReplies,
  selectedConversation,
}: {
  quickReplies: QuickReplies;
  selectedConversation: NonNullable<ConversationDetail>;
}) {
  return (
    <section className="chat-detail-surface">
      <div className="chat-detail-header">
        <div>
          <h1>{selectedConversation.contactName}</h1>
          <p>{formatContactAddress(selectedConversation.channel, selectedConversation.contactPhone)}</p>
        </div>
        <span
          className={
            selectedConversation.status === "HUMAN_NEEDED" ? "status status-warning" : "status"
          }
        >
          {formatConversationStatus(selectedConversation.status)}
        </span>
      </div>

      <ConversationModeControls
        conversationId={selectedConversation.id}
        status={selectedConversation.status}
      />

      <form className="conversation-assignment" action={assignConversationAction}>
        <input name="conversationId" type="hidden" value={selectedConversation.id} />
        <label>
          Ditangani oleh
          <select
            name="assigneeUserId"
            defaultValue={selectedConversation.assignedToUser?.id ?? ""}
          >
            <option value="">Belum ditugaskan</option>
            {selectedConversation.assignableUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
        <button className="small-outline-button" type="submit">
          Simpan assignment
        </button>
      </form>

      {selectedConversation.lead ? (
        <div className="card">
          <div className="section-header">
            <div>
              <p className="eyebrow">{selectedConversation.lead.source}</p>
              <h2>Lead snapshot</h2>
            </div>
            <span
              className={
                selectedConversation.lead.status === "QUALIFIED" ? "status" : "status status-warning"
              }
            >
              {formatConversationStatus(selectedConversation.lead.status)} ·{" "}
              {selectedConversation.lead.qualificationScore ?? 0}/100
            </span>
          </div>
          <p>{selectedConversation.lead.needSummary}</p>
          <div className="lead-grid">
            <div>
              <p className="muted">Service: {selectedConversation.lead.serviceInterest ?? "-"}</p>
              <p className="muted">Lokasi: {selectedConversation.lead.location ?? "-"}</p>
              <p className="muted">Budget: {selectedConversation.lead.budget ?? "-"}</p>
              <p className="muted">Urgency: {selectedConversation.lead.urgency ?? "-"}</p>
            </div>
            <div>
              <p className="muted">
                Estimasi awal:{" "}
                {formatEstimateRange(
                  selectedConversation.lead.estimatedValueMin,
                  selectedConversation.lead.estimatedValueMax,
                )}
              </p>
              {selectedConversation.lead.estimateNote ? <p>{selectedConversation.lead.estimateNote}</p> : null}
              {selectedConversation.lead.nextStep ? (
                <p className="muted">Next step: {selectedConversation.lead.nextStep}</p>
              ) : null}
              {selectedConversation.lead.nextFollowUpAt ? (
                <p className="muted">
                  Follow-up: {formatDateTime(selectedConversation.lead.nextFollowUpAt)}
                </p>
              ) : null}
              {selectedConversation.lead.followUpReason ? (
                <p className="muted">{selectedConversation.lead.followUpReason}</p>
              ) : null}
              <Link className="ghost-button" href="/leads">
                Buka pipeline leads
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <form className="owner-notes-form" action={updateConversationNotesAction}>
        <input name="conversationId" type="hidden" value={selectedConversation.id} />
        <label>
          Internal owner notes
          <textarea
            name="ownerNotes"
            defaultValue={selectedConversation.ownerNotes ?? ""}
            placeholder="Follow up besok, minta foto lokasi, budget 5 juta..."
          />
        </label>
        <button className="ghost-button" type="submit">
          Save notes
        </button>
      </form>

      <ChatMessageThread
        conversationId={selectedConversation.id}
        hasOlderMessages={selectedConversation.hasOlderMessages}
        messageLimit={selectedConversation.messageLimit}
        messages={selectedConversation.messages}
      />

      {selectedConversation.channel === "WHATSAPP" &&
      !isWhatsAppCustomerCareWindowOpen(
        selectedConversation.lastCustomerMessageAt,
      ) ? (
        <details className="whatsapp-template-panel">
          <summary>Kirim template WhatsApp di luar jendela 24 jam</summary>
          <form className="form-grid" action={sendWhatsAppTemplateAction}>
            <input
              name="conversationId"
              type="hidden"
              value={selectedConversation.id}
            />
            <label>
              Nama template Meta
              <input
                name="templateName"
                type="text"
                pattern="[a-z0-9_]{1,512}"
                placeholder="follow_up_customer"
                required
              />
            </label>
            <label>
              Bahasa
              <input name="languageCode" type="text" defaultValue="id" required />
            </label>
            <label className="span-2">
              Parameter body <small>(satu nilai per baris)</small>
              <textarea
                name="bodyParameters"
                placeholder={"Nama customer\nNama layanan"}
                rows={3}
              />
            </label>
            <button className="primary-button span-2" type="submit">
              Kirim approved template
            </button>
          </form>
        </details>
      ) : null}

      <div className="quick-reply-strip" aria-label="Quick replies">
        {quickReplies.length > 0 ? (
          <form action={sendOwnerReplyAction} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input name="conversationId" type="hidden" value={selectedConversation.id} />
            <select
              name="message"
              defaultValue=""
              required
              aria-label="Pilih quick reply"
              style={{ maxWidth: "min(100%, 480px)" }}
            >
              <option value="" disabled>Pilih template balasan</option>
              {quickReplies.map((reply) => (
                <option key={reply.id} value={reply.content}>
                  {reply.shortcut ?? reply.name} — {reply.content.slice(0, 80)}
                </option>
              ))}
            </select>
            <button className="small-outline-button" type="submit">
              Kirim template
            </button>
          </form>
        ) : null}
        <Link className="small-outline-button" href="/quick-replies">
          Kelola template
        </Link>
      </div>

      <ChatReplyComposer
        conversationId={selectedConversation.id}
        quickReplies={quickReplies}
        blockedReason={
          selectedConversation.channel === "WHATSAPP" &&
          !isWhatsAppCustomerCareWindowOpen(selectedConversation.lastCustomerMessageAt)
            ? "Jendela layanan WhatsApp 24 jam sudah berakhir. Kirim approved template Meta, atau tunggu pelanggan mengirim pesan baru."
            : null
        }
      />
    </section>
  );
}

*/
function ConversationDetailPanel({
  quickReplies,
  selectedConversation,
}: {
  quickReplies: QuickReplies;
  selectedConversation: NonNullable<ConversationDetail>;
}) {
  const outsideWhatsAppWindow =
    selectedConversation.channel === "WHATSAPP" &&
    !isWhatsAppCustomerCareWindowOpen(selectedConversation.lastCustomerMessageAt);

  return (
    <section className="chat-detail-surface">
      <div className="chat-detail-header">
        <div className="chat-contact-identity">
          <span className="chat-contact-avatar" aria-hidden="true">
            {selectedConversation.contactName.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <h1>{selectedConversation.contactName}</h1>
            <p>{formatContactAddress(selectedConversation.channel, selectedConversation.contactPhone)}</p>
          </div>
        </div>
        <span className={selectedConversation.status === "HUMAN_NEEDED" ? "status status-warning" : "status"}>
          {formatConversationStatus(selectedConversation.status)}
        </span>
      </div>

      <div className="chat-detail-body">
        <div className="chat-conversation-column">
          <ChatMessageThread
            conversationId={selectedConversation.id}
            hasOlderMessages={selectedConversation.hasOlderMessages}
            messageLimit={selectedConversation.messageLimit}
            messages={selectedConversation.messages}
          />

          {outsideWhatsAppWindow ? (
            <details className="whatsapp-template-panel">
              <summary>Kirim template WhatsApp di luar jendela 24 jam</summary>
              <form className="form-grid" action={sendWhatsAppTemplateAction}>
                <input name="conversationId" type="hidden" value={selectedConversation.id} />
                <label>
                  Nama template Meta
                  <input name="templateName" type="text" pattern="[a-z0-9_]{1,512}" placeholder="follow_up_customer" required />
                </label>
                <label>
                  Bahasa
                  <input name="languageCode" type="text" defaultValue="id" required />
                </label>
                <label className="span-2">
                  Parameter body <small>(satu nilai per baris)</small>
                  <textarea name="bodyParameters" placeholder={"Nama customer\nNama layanan"} rows={3} />
                </label>
                <button className="primary-button span-2" type="submit">Kirim approved template</button>
              </form>
            </details>
          ) : null}

          {quickReplies.length > 0 ? (
            <details className="quick-reply-strip">
              <summary>Gunakan balasan cepat</summary>
              <form action={sendOwnerReplyAction}>
                <input name="conversationId" type="hidden" value={selectedConversation.id} />
                <select name="message" defaultValue="" required aria-label="Pilih balasan cepat">
                  <option value="" disabled>Pilih template balasan</option>
                  {quickReplies.map((reply) => (
                    <option key={reply.id} value={reply.content}>
                      {reply.shortcut ?? reply.name} — {reply.content.slice(0, 80)}
                    </option>
                  ))}
                </select>
                <button className="small-outline-button" type="submit">Kirim</button>
                <Link className="small-outline-button" href="/quick-replies">Kelola</Link>
              </form>
            </details>
          ) : null}

          <ChatReplyComposer
            conversationId={selectedConversation.id}
            quickReplies={quickReplies}
            blockedReason={
              outsideWhatsAppWindow
                ? "Jendela layanan WhatsApp 24 jam sudah berakhir. Kirim approved template Meta, atau tunggu pelanggan mengirim pesan baru."
                : null
            }
          />
        </div>

        <aside className="chat-context-panel" aria-label="Detail percakapan">
          <section className="chat-context-section chat-context-controls">
            <div className="chat-context-heading">
              <div>
                <strong>Kendali chat</strong>
                <span>Atur siapa yang menjawab pelanggan.</span>
              </div>
              <ConversationModeControls conversationId={selectedConversation.id} status={selectedConversation.status} />
            </div>
          </section>

          <details className="chat-context-section" open>
            <summary>Penanggung jawab</summary>
            <form className="conversation-assignment" action={assignConversationAction}>
              <input name="conversationId" type="hidden" value={selectedConversation.id} />
              <select name="assigneeUserId" defaultValue={selectedConversation.assignedToUser?.id ?? ""} aria-label="Ditangani oleh">
                <option value="">Belum ditugaskan</option>
                {selectedConversation.assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <button className="small-outline-button" type="submit">Simpan</button>
            </form>
          </details>

          {selectedConversation.lead ? (
            <details className="chat-context-section" open>
              <summary>
                <span>Ringkasan lead</span>
                <span className="context-score">{selectedConversation.lead.qualificationScore ?? 0}/100</span>
              </summary>
              <p className="lead-summary">{selectedConversation.lead.needSummary}</p>
              <dl className="lead-facts">
                <div><dt>Layanan</dt><dd>{selectedConversation.lead.serviceInterest ?? "-"}</dd></div>
                <div><dt>Lokasi</dt><dd>{selectedConversation.lead.location ?? "-"}</dd></div>
                <div><dt>Budget</dt><dd>{selectedConversation.lead.budget ?? "-"}</dd></div>
                <div><dt>Urgensi</dt><dd>{selectedConversation.lead.urgency ?? "-"}</dd></div>
                <div><dt>Estimasi</dt><dd>{formatEstimateRange(selectedConversation.lead.estimatedValueMin, selectedConversation.lead.estimatedValueMax)}</dd></div>
              </dl>
              {selectedConversation.lead.nextStep ? <p className="context-note">Langkah berikutnya: {selectedConversation.lead.nextStep}</p> : null}
              {selectedConversation.lead.nextFollowUpAt ? <p className="context-note">Follow-up: {formatDateTime(selectedConversation.lead.nextFollowUpAt)}</p> : null}
              <Link className="context-link" href="/leads">Buka detail lead</Link>
            </details>
          ) : null}

          <details className="chat-context-section">
            <summary>Catatan internal</summary>
            <form className="owner-notes-form" action={updateConversationNotesAction}>
              <input name="conversationId" type="hidden" value={selectedConversation.id} />
              <textarea name="ownerNotes" defaultValue={selectedConversation.ownerNotes ?? ""} placeholder="Follow up besok, minta foto lokasi..." aria-label="Catatan internal" />
              <button className="small-outline-button" type="submit">Simpan catatan</button>
            </form>
          </details>
        </aside>
      </div>
    </section>
  );
}

function ChatFeaturePanel({
  agentPage,
  inbox,
  searchParams,
  view,
  whatsAppPage,
}: {
  agentPage: AgentSettingsPageData | null;
  inbox: ConversationInbox;
  searchParams: Record<string, string | string[] | undefined>;
  view: Exclude<ChatView, "chat">;
  whatsAppPage: WhatsAppSettingsPageData | null;
}) {
  const meta = chatFeatureMeta[view];

  return (
    <section className="chat-feature-page">
      <div className="chat-feature-header">
        <div>
          <p className="eyebrow">Chat module</p>
          <h1>{meta.title}</h1>
          <p>{meta.description}</p>
        </div>
        <Link className="ghost-button" href="/conversations">
          Back to inbox
        </Link>
      </div>

      {view === "analytics" ? <AnalyticsPanel inbox={inbox} /> : null}
      {view === "conversations" ? (
        <ConversationsPanel inbox={inbox} searchParams={searchParams} />
      ) : null}
      {view === "ai-agents" && agentPage ? <AIAgentsPanel agentPage={agentPage} inbox={inbox} /> : null}
      {view === "platforms" && whatsAppPage ? (
        <PlatformsPanel searchParams={searchParams} whatsAppPage={whatsAppPage} />
      ) : null}
      {view === "flow" && agentPage && whatsAppPage ? (
        <FlowPanel agentPage={agentPage} whatsAppPage={whatsAppPage} />
      ) : null}
      {view === "settings" && agentPage ? <ChatSettingsPanel agentPage={agentPage} /> : null}
    </section>
  );
}

function AnalyticsPanel({ inbox }: { inbox: ConversationInbox }) {
  const active = inbox.summary.open + inbox.summary.humanNeeded;
  const totalMessages = inbox.conversations.reduce(
    (sum, conversation) => sum + conversation.messageCount,
    0,
  );

  return (
    <div className="chat-feature-stack">
      <div className="chat-metric-grid">
        <MetricCard icon={MessageCircle} label="Active chats" value={active} />
        <MetricCard icon={Bell} label="Needs human" value={inbox.summary.humanNeeded} tone="warning" />
        <MetricCard icon={CheckCircle} label="Closed" value={inbox.summary.closed} />
        <MetricCard icon={Activity} label="Messages tracked" value={totalMessages} />
      </div>

      <div className="chat-feature-card">
        <div className="feature-card-title">
          <h2>Queue overview</h2>
          <Link href="/conversations?status=HUMAN_NEEDED">Open human queue</Link>
        </div>
        <div className="feature-row-list">
          {inbox.conversations.slice(0, 6).map((conversation) => (
            <Link className="feature-row" href={`/conversations?conversationId=${conversation.id}`} key={conversation.id}>
              <span>
                <strong>{conversation.contactName}</strong>
                <small>{conversation.lastMessage || "No recent message"}</small>
              </span>
              <span className={conversation.status === "HUMAN_NEEDED" ? "status status-warning" : "status"}>
                {formatConversationStatus(conversation.status)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConversationsPanel({
  inbox,
  searchParams,
}: {
  inbox: ConversationInbox;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const q = getSearchParam(searchParams, "q");
  const status = getSearchParam(searchParams, "status");

  return (
    <div className="chat-feature-card">
      <div className="feature-card-title">
        <h2>Conversation archive</h2>
        <span>{inbox.conversations.length} latest conversations</span>
      </div>
      <form className="chat-archive-filter" action="/conversations" method="get">
        <input name="view" type="hidden" value="conversations" />
        <input
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder="Search contact or message"
          maxLength={160}
        />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">All status</option>
          {Object.values(ConversationStatus).map((option) => (
            <option key={option} value={option}>
              {formatConversationStatus(option)}
            </option>
          ))}
        </select>
        <button className="ghost-button" type="submit">
          Filter
        </button>
      </form>
      <div className="archive-table">
        {inbox.conversations.map((conversation) => (
          <Link
            className="archive-row"
            href={buildInboxPageUrl({
              conversationId: conversation.id,
              q,
              status,
              page: inbox.pagination.page,
            })}
            key={conversation.id}
          >
            <span>
              <strong>{conversation.contactName}</strong>
              <small>{formatContactAddress(conversation.channel, conversation.contactPhone)}</small>
            </span>
            <span>{conversation.lastMessage || "-"}</span>
            <span className={conversation.status === "HUMAN_NEEDED" ? "status status-warning" : "status"}>
              {formatConversationStatus(conversation.status)}
            </span>
            <span>{conversation.messageCount} msg</span>
          </Link>
        ))}
      </div>
      {inbox.pagination.pageCount > 1 ? (
        <nav className="orders-pagination" aria-label="Pagination conversation archive">
          {inbox.pagination.page > 1 ? (
            <Link
              href={buildInboxPageUrl({
                q,
                status,
                view: "conversations",
                page: inbox.pagination.page - 1,
              })}
            >
              Sebelumnya
            </Link>
          ) : <span />}
          <small>{inbox.pagination.page}/{inbox.pagination.pageCount}</small>
          {inbox.pagination.page < inbox.pagination.pageCount ? (
            <Link
              href={buildInboxPageUrl({
                q,
                status,
                view: "conversations",
                page: inbox.pagination.page + 1,
              })}
            >
              Berikutnya
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}

function AIAgentsPanel({
  agentPage,
  inbox,
}: {
  agentPage: AgentSettingsPageData;
  inbox: ConversationInbox;
}) {
  return (
    <div className="chat-feature-grid">
      <div className="chat-feature-card">
        <div className="feature-card-title">
          <h2>Agent runtime</h2>
          <span className={agentPage.settings.isActive ? "status" : "status status-warning"}>
            {agentPage.settings.isActive ? "Active" : "Off"}
          </span>
        </div>
        <form className="form-grid" action={updateAgentSettingsAction}>
          <label>
            Agent name
            <input name="agentName" type="text" defaultValue={agentPage.settings.agentName} required />
          </label>
          <label>
            Language
            <select name="language" defaultValue={agentPage.settings.language}>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="span-2">
            Tone
            <input name="tone" type="text" defaultValue={agentPage.settings.tone} />
          </label>
          <label className="checkbox-label span-2">
            <input name="isActive" type="checkbox" defaultChecked={agentPage.settings.isActive} />
            Auto-reply active
          </label>
          <label className="span-2">
            Business description
            <textarea name="businessDescription" defaultValue={agentPage.settings.businessDescription ?? ""} />
          </label>
          <label className="span-2">
            Handoff rules
            <textarea name="handoffRules" defaultValue={agentPage.settings.handoffRules ?? ""} />
          </label>
          <input name="openingMessage" type="hidden" value={agentPage.settings.openingMessage ?? ""} />
          <input name="closingMessage" type="hidden" value={agentPage.settings.closingMessage ?? ""} />
          <input name="systemInstruction" type="hidden" value={agentPage.settings.systemInstruction ?? ""} />
          <button className="primary-button span-2" type="submit">
            Save AI agent
          </button>
        </form>
      </div>

      <div className="chat-feature-card">
        <h2>Human handoff queue</h2>
        <div className="agent-queue-number">{inbox.summary.humanNeeded}</div>
        <p className="muted">Percakapan yang sedang butuh manusia.</p>
        <Link className="ghost-button" href="/conversations?status=HUMAN_NEEDED">
          Review queue
        </Link>
      </div>
    </div>
  );
}

function PlatformsPanel({
  searchParams,
  whatsAppPage,
}: {
  searchParams: Record<string, string | string[] | undefined>;
  whatsAppPage: WhatsAppSettingsPageData;
}) {
  const selectedPlatform = getSearchParam(searchParams, "platform");
  const webhookUrl =
    whatsAppPage.settings?.webhookUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/whatsapp`;
  const platforms = [
    {
      key: "telegram",
      label: "Telegram",
      icon: Send,
      className: "telegram",
      enabled: true,
      href: "/integrations?platform=telegram",
    },
    {
      key: "messenger",
      label: "Messenger",
      icon: MessageCircle,
      className: "messenger",
      enabled: false,
      href: "/conversations?view=platforms&platform=messenger",
    },
    {
      key: "live-chat",
      label: "Web Live Chat",
      icon: MessageCircle,
      className: "live-chat",
      enabled: true,
      href: "/integrations?platform=live-chat",
    },
    {
      key: "whatsapp",
      label: "WhatsApp Business",
      icon: RadioTower,
      className: "whatsapp",
      enabled: true,
      href: "/conversations?view=platforms&platform=whatsapp",
    },
    {
      key: "instagram",
      label: "Instagram",
      icon: Megaphone,
      className: "instagram",
      enabled: false,
      href: "/conversations?view=platforms&platform=instagram",
    },
    {
      key: "gmail",
      label: "Gmail",
      icon: Mail,
      className: "gmail",
      enabled: false,
      href: "/conversations?view=platforms&platform=gmail",
    },
    {
      key: "other-email",
      label: "Other Email",
      icon: Mail,
      className: "email",
      enabled: false,
      href: "/conversations?view=platforms&platform=other-email",
    },
    {
      key: "tiktok",
      label: "TikTok",
      icon: Music2,
      className: "tiktok",
      enabled: false,
      href: "/conversations?view=platforms&platform=tiktok",
    },
  ];
  const selectedPlatformConfig = platforms.find((platform) => platform.key === selectedPlatform);

  return (
    <div className="platform-connect-shell">
      <div className="platform-picker">
        <div className="platform-picker-header">
          <div>
            <h2>Platform</h2>
            <p>Select the platform you wish to establish your new inbox</p>
          </div>
          <Link className="platform-close" href="/conversations" aria-label="Close platform picker">
            x
          </Link>
        </div>

        <div className="platform-grid">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const isSelected = selectedPlatform === platform.key;
            return (
              <Link
                className={isSelected ? "platform-card selected" : "platform-card"}
                href={platform.href}
                key={platform.key}
              >
                <span className={`platform-orb ${platform.className}`}>
                  <Icon size={34} aria-hidden="true" />
                </span>
                <strong>{platform.label}</strong>
                {!platform.enabled ? <small>Coming soon</small> : null}
                {platform.key === "telegram" ? <small>Kelola di Integrations</small> : null}
                {platform.key === "live-chat" ? <small>Ready</small> : null}
                {platform.key === "whatsapp" && whatsAppPage.ready ? <small>Connected</small> : null}
              </Link>
            );
          })}
        </div>
      </div>

      {selectedPlatform && selectedPlatform !== "whatsapp" ? (
        <div className="platform-coming-soon">
          <strong>
            {selectedPlatformConfig?.enabled
              ? `${selectedPlatformConfig.label} tersedia`
              : `${selectedPlatformConfig?.label ?? "Channel"} belum aktif`}
          </strong>
          <p>
            {selectedPlatformConfig?.enabled
              ? "Konfigurasi channel ini dikelola dari halaman Integrations agar inbox tetap ringan."
              : "Channel ini tetap ada di roadmap dan belum menerima pesan pada versi beta sekarang."}
          </p>
          <Link
            className="primary-button"
            href={
              selectedPlatformConfig?.enabled
                ? selectedPlatformConfig.href
                : "/integrations?platform=telegram"
            }
          >
            {selectedPlatformConfig?.enabled
              ? "Buka Integrations"
              : "Connect Telegram"}
          </Link>
        </div>
      ) : null}

      {selectedPlatform === "whatsapp" ? (
        <div className="platform-setup-card">
          <div className="feature-card-title">
            <h2>WhatsApp Business setup</h2>
            <span className={whatsAppPage.ready ? "status" : "status status-warning"}>
              {whatsAppPage.ready ? "Connected" : "Draft"}
            </span>
          </div>
          {whatsAppPage.configurationIssue ? (
            <div className="settings-note" role="alert">
              {whatsAppPage.configurationIssue}
            </div>
          ) : null}
          <form
            className="form-grid"
            action={updateWhatsAppSettingsAction}
            autoComplete="off"
          >
            <input name="returnTo" type="hidden" value="/integrations?platform=whatsapp" />
            <label>
              WhatsApp Business Account ID
              <input
                name="wabaId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{5,32}"
                defaultValue={whatsAppPage.settings?.wabaId ?? ""}
                required
              />
            </label>
            <label>
              Phone Number ID
              <input
                name="phoneNumberId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{5,32}"
                defaultValue={whatsAppPage.settings?.phoneNumberId ?? ""}
                required
              />
            </label>
            <label className="span-2">
              Webhook URL
              <input name="webhookUrl" type="url" value={webhookUrl} readOnly />
            </label>
            <label className="span-2">
              Access Token
              <input
                name="accessToken"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={4096}
                required={!whatsAppPage.settings?.accessTokenSet}
                placeholder={`Current: ${whatsAppPage.settings?.accessTokenMasked ?? "Not set"}`}
              />
            </label>
            <label>
              Verify Token (opsional)
              <input
                name="verifyToken"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={4096}
                placeholder={`Current: ${whatsAppPage.settings?.verifyTokenMasked ?? "Not set"}`}
              />
            </label>
            <label>
              App Secret
              <input
                name="appSecret"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={4096}
                required={!whatsAppPage.settings?.appSecretSet}
                placeholder={`Current: ${whatsAppPage.settings?.appSecretMasked ?? "Not set"}`}
              />
            </label>
            <label className="checkbox-label span-2">
              <input name="isActive" type="checkbox" defaultChecked={whatsAppPage.settings?.isActive} />
              Aktifkan dan verifikasi koneksi ke Meta
            </label>
            <button className="primary-button span-2" type="submit">
              Simpan &amp; tes koneksi Meta
            </button>
          </form>

          <div className="platform-checklist">
            <ChecklistRow done={Boolean(whatsAppPage.settings?.wabaId)} label="WABA ID" />
            <ChecklistRow done={Boolean(whatsAppPage.settings?.phoneNumberId)} label="Phone number ID" />
            <ChecklistRow done={Boolean(whatsAppPage.settings?.accessTokenMasked !== "Not set")} label="Access token" />
            <ChecklistRow done={Boolean(whatsAppPage.settings?.verifyTokenMasked !== "Not set")} label="Verify token" />
            <ChecklistRow done={Boolean(whatsAppPage.settings?.appSecretMasked !== "Not set")} label="App secret" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FlowPanel({
  agentPage,
  whatsAppPage,
}: {
  agentPage: AgentSettingsPageData;
  whatsAppPage: WhatsAppSettingsPageData;
}) {
  return (
    <div className="chat-feature-grid">
      <div className="chat-feature-card">
        <h2>Alur percakapan Aijou</h2>
        <div className="flow-builder">
          <FlowStep icon={RadioTower} title="1. Pesan masuk" detail={whatsAppPage.ready ? "WhatsApp terhubung" : "Hubungkan channel terlebih dahulu"} />
          <FlowStep icon={Bot} title="2. Aijou membaca konteks" detail="Agent memakai profil bisnis dan knowledge base." />
          <FlowStep icon={GitBranch} title="3. Tentukan langkah berikutnya" detail="Jualan, dukungan, pembayaran, atau handover." />
          <FlowStep icon={ShieldCheck} title="4. Manusia tetap memegang kendali" detail="Aijou meneruskan chat ketika aturan terpenuhi." />
        </div>
      </div>

      <div className="chat-feature-card">
        <h2>Handoff rule editor</h2>
        <form className="form-grid" action={updateAgentSettingsAction}>
          <input name="agentName" type="hidden" value={agentPage.settings.agentName} />
          <input name="language" type="hidden" value={agentPage.settings.language} />
          <input name="tone" type="hidden" value={agentPage.settings.tone} />
          <input name="businessDescription" type="hidden" value={agentPage.settings.businessDescription ?? ""} />
          <input name="openingMessage" type="hidden" value={agentPage.settings.openingMessage ?? ""} />
          <input name="closingMessage" type="hidden" value={agentPage.settings.closingMessage ?? ""} />
          <input name="systemInstruction" type="hidden" value={agentPage.settings.systemInstruction ?? ""} />
          {agentPage.settings.isActive ? <input name="isActive" type="hidden" value="on" /> : null}
          <label className="span-2">
            Handoff rules
            <textarea name="handoffRules" defaultValue={agentPage.settings.handoffRules ?? ""} />
          </label>
          <button className="primary-button span-2" type="submit">
            Save flow rules
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatSettingsPanel({ agentPage }: { agentPage: AgentSettingsPageData }) {
  return (
    <div className="chat-feature-grid">
      <div className="chat-feature-card">
        <h2>Conversation messages</h2>
        <form className="form-grid" action={updateAgentSettingsAction}>
          <input name="agentName" type="hidden" value={agentPage.settings.agentName} />
          <input name="language" type="hidden" value={agentPage.settings.language} />
          <input name="tone" type="hidden" value={agentPage.settings.tone} />
          <input name="businessDescription" type="hidden" value={agentPage.settings.businessDescription ?? ""} />
          <input name="handoffRules" type="hidden" value={agentPage.settings.handoffRules ?? ""} />
          <input name="systemInstruction" type="hidden" value={agentPage.settings.systemInstruction ?? ""} />
          {agentPage.settings.isActive ? <input name="isActive" type="hidden" value="on" /> : null}
          <label className="span-2">
            Opening message
            <textarea name="openingMessage" defaultValue={agentPage.settings.openingMessage ?? ""} />
          </label>
          <label className="span-2">
            Closing message
            <textarea name="closingMessage" defaultValue={agentPage.settings.closingMessage ?? ""} />
          </label>
          <button className="primary-button span-2" type="submit">
            Save chat settings
          </button>
        </form>
      </div>

      <div className="chat-feature-card">
        <h2>Shortcut settings</h2>
        <div className="feature-row-list">
          <Link className="feature-row" href="/quick-replies">
            <span>
              <strong>Quick replies</strong>
              <small>Manage reusable replies for human agents.</small>
            </span>
            <Zap size={18} aria-hidden="true" />
          </Link>
          <Link className="feature-row" href="/conversations?view=platforms">
            <span>
              <strong>Connected platforms</strong>
              <small>Set WhatsApp credentials without editing env.</small>
            </span>
            <RadioTower size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function WelcomeChecklist() {
  const steps = [
    {
      icon: RadioTower,
      title: "Hubungkan channel",
      description: "Mulai menerima chat dari WhatsApp dan simulator.",
      href: "/conversations?view=platforms",
    },
    {
      icon: Bot,
      title: "Siapkan Aijou",
      description: "Ajarkan Aijou cara menjawab pelanggan Anda.",
      href: "/conversations?view=ai-agents",
    },
    {
      icon: MessageCircle,
      title: "Tetapkan handover",
      description: "Beri tim Anda kendali saat percakapan butuh bantuan manusia.",
      href: "/conversations",
    },
    {
      icon: GitBranch,
      title: "Aktifkan alur percakapan",
      description: "Hubungkan Aijou dan tim Anda ke setiap channel yang dipakai.",
      href: "/conversations?view=flow",
    },
  ];

  return (
    <div className="chat-welcome">
      <p className="eyebrow">Aijou AI</p>
      <h1>Jadikan setiap chat punya arah yang jelas.</h1>
      <div className="welcome-card-list">
        {steps.map((step, index) => {
          const Icon = step.icon;

          return (
            <Link className="welcome-step-card" href={step.href} key={step.title}>
              <span className="welcome-icon">
                <Icon size={34} aria-hidden="true" />
              </span>
              <span>
                <strong>
                  {index + 1}. {step.title}
                </strong>
                <small>{step.description}</small>
              </span>
            </Link>
          );
        })}
      </div>
      <Link className="tutorial-link" href="/setup">
        Butuh panduan? Buka setup Aijou
      </Link>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof MessageCircle;
  label: string;
  tone?: "warning";
  value: number;
}) {
  return (
    <div className={tone === "warning" ? "chat-metric-card warning" : "chat-metric-card"}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChecklistRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="checklist-item">
      <BadgeCheck size={18} aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{done ? "Ready" : "Missing"}</small>
      </span>
    </div>
  );
}

function FlowStep({
  detail,
  icon: Icon,
  title,
}: {
  detail: string;
  icon: typeof MessageCircle;
  title: string;
}) {
  return (
    <div className="flow-step">
      <Icon size={19} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

const chatFeatureMeta: Record<Exclude<ChatView, "chat">, { title: string; description: string }> = {
  analytics: {
    title: "Analytics",
    description: "Monitor volume, queue health, and conversations that need human attention.",
  },
  conversations: {
    title: "Conversations",
    description: "Archive view for searching, filtering, and reopening customer conversations.",
  },
  "ai-agents": {
    title: "AI Agents",
    description: "Control the agent that replies to incoming customer messages.",
  },
  platforms: {
    title: "Connected Platforms",
    description: "Kelola Telegram, web live chat, dan WhatsApp dari satu workspace.",
  },
  flow: {
    title: "Flow",
    description: "Design the route from incoming message to AI reply or human takeover.",
  },
  settings: {
    title: "Settings",
    description: "Tune chat messages, quick replies, and operational shortcuts.",
  },
};

function buildInboxPageUrl(params: {
  conversationId?: string;
  history?: number;
  q?: string;
  status?: string;
  unread?: boolean;
  view?: "conversations";
  page: number;
}) {
  const search = new URLSearchParams();
  if (params.conversationId) search.set("conversationId", params.conversationId);
  if (params.history && params.history > 50) search.set("history", String(params.history));
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.unread) search.set("unread", "1");
  if (params.view) search.set("view", params.view);
  search.set("page", String(params.page));
  return `/conversations?${search.toString()}`;
}

function normalizeHistoryLimit(value?: string) {
  const parsed = Number(value ?? 50);
  return Math.min(500, Math.max(50, Number.isFinite(parsed) ? Math.round(parsed) : 50));
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function normalizeChatView(value?: string): ChatView {
  const supported: ChatView[] = [
    "chat",
    "analytics",
    "conversations",
    "ai-agents",
    "platforms",
    "flow",
    "settings",
  ];

  return supported.includes(value as ChatView) ? (value as ChatView) : "chat";
}

function formatInboxDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatChannelLabel(channel: string, leadSource?: string | null) {
  if (channel === "TELEGRAM") return "Telegram";
  if (channel === "WEB_CHAT") return leadSource === "BRIEF" ? "Brief" : "Web Chat";
  return "WhatsApp";
}

function formatContactAddress(channel: string, value: string) {
  if (channel === "TELEGRAM") return "Telegram private chat";
  return value;
}

function formatEstimateRange(min?: string | null, max?: string | null) {
  if (!min && !max) {
    return "-";
  }

  if (min && max) {
    return `${formatRupiah(min)} - ${formatRupiah(max)}`;
  }

  return formatRupiah(min ?? max ?? "0");
}

function formatRupiah(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(numeric);
}
