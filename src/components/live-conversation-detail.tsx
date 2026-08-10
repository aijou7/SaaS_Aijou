"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  assignConversationAction,
  sendOwnerReplyAction,
  sendWhatsAppTemplateAction,
  updateConversationNotesAction,
} from "@/app/conversations/actions";
import { ChatMessageThread } from "@/components/chat-message-thread";
import { ChatReplyComposer } from "@/components/chat-reply-composer";
import { ConversationModeControls } from "@/components/conversation-mode-controls";
import { loadConversationDetail } from "@/components/fast-conversation-link";
import { isWhatsAppCustomerCareWindowOpen } from "@/lib/whatsapp-window";

type ConversationDetail = {
  id: string;
  contactName: string;
  contactPhone: string;
  channel: string;
  status: string;
  ownerNotes: string | null;
  assignedToUser: { id: string; name: string } | null;
  assignableUsers: Array<{ id: string; name: string }>;
  lastCustomerMessageAt: string | null;
  hasOlderMessages: boolean;
  messageLimit: number;
  messages: Array<{
    id: string;
    senderType: string;
    messageBody: string;
    deliveryStatus: string;
    deliveryError: string | null;
    createdAt?: string;
    media: {
      url: string;
      mimeType: string | null;
      fileSize: number | null;
      available: boolean;
    } | null;
  }>;
  lead: {
    source: string;
    needSummary: string;
    serviceInterest: string | null;
    location: string | null;
    budget: string | null;
    urgency: string | null;
    qualificationScore: number | null;
  } | null;
};

type QuickReply = {
  id: string;
  name: string;
  content: string;
  shortcut: string | null;
};

export function LiveConversationDetail(props: {
  initialDetail: ConversationDetail | null;
  initialPanel: ReactNode;
  quickReplies: QuickReply[];
  readOnly?: boolean;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(
    props.initialDetail,
  );
  const [hasClientSelection, setHasClientSelection] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const stopLoading = () => {
      if (loadingTimerRef.current !== null) {
        window.clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      setLoading(false);
    };
    const handleStart = () => {
      setLoading(true);
      if (loadingTimerRef.current !== null) window.clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = window.setTimeout(stopLoading, 8_000);
    };
    const handleLoaded = (event: Event) => {
      setDetail((event as CustomEvent<ConversationDetail>).detail);
      setHasClientSelection(true);
      stopLoading();
    };
    const handlePopState = () => {
      const id = new URLSearchParams(window.location.search).get(
        "conversationId",
      );
      if (!id) return;
      setLoading(true);
      void loadConversationDetail(id)
        .then((value) => {
          setDetail(value as ConversationDetail);
          setHasClientSelection(true);
        })
        .catch(() => window.location.reload())
        .finally(stopLoading);
    };
    const handleInboxChange = () => {
      const id = new URLSearchParams(window.location.search).get(
        "conversationId",
      );
      if (!id) return;
      void loadConversationDetail(id, 50, true)
        .then((value) => {
          setDetail(value as ConversationDetail);
          setHasClientSelection(true);
        })
        .catch(() => undefined);
    };
    window.addEventListener("aijou:conversation-load-start", handleStart);
    window.addEventListener("aijou:conversation-loaded", handleLoaded);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("aijou:inbox-state-changed", handleInboxChange);
    return () => {
      if (loadingTimerRef.current !== null) window.clearTimeout(loadingTimerRef.current);
      window.removeEventListener("aijou:conversation-load-start", handleStart);
      window.removeEventListener("aijou:conversation-loaded", handleLoaded);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener(
        "aijou:inbox-state-changed",
        handleInboxChange,
      );
    };
  }, []);

  if (!hasClientSelection) {
    return (
      <div className={loading ? "conversation-panel-loading" : undefined}>
        {props.initialPanel}
      </div>
    );
  }
  if (!detail) return null;

  return (
    <ClientConversationPanel
      detail={detail}
      loading={loading}
      quickReplies={props.quickReplies}
      readOnly={Boolean(props.readOnly)}
    />
  );
}

/* Previous layout retained temporarily during the task-first inbox rollout.
function LegacyClientConversationPanel(props: {
  detail: ConversationDetail;
  quickReplies: QuickReply[];
  loading: boolean;
}) {
  const { detail } = props;
  const freeformWhatsAppBlocked =
    detail.channel === "WHATSAPP" &&
    !isWhatsAppCustomerCareWindowOpen(detail.lastCustomerMessageAt);
  const freeformBlockReason = freeformWhatsAppBlocked
    ? "Jendela layanan WhatsApp 24 jam sudah berakhir. Kirim approved template Meta, atau tunggu pelanggan mengirim pesan baru."
    : null;
  return (
    <section
      className={
        props.loading
          ? "chat-detail-surface conversation-panel-loading"
          : "chat-detail-surface"
      }
    >
      <div className="chat-detail-header">
        <div>
          <h1>{detail.contactName}</h1>
          <p>{formatAddress(detail.channel, detail.contactPhone)}</p>
        </div>
        <span
          className={
            detail.status === "HUMAN_NEEDED"
              ? "status status-warning"
              : "status"
          }
        >
          {formatLabel(detail.status)}
        </span>
      </div>

      <ConversationModeControls
        conversationId={detail.id}
        status={detail.status}
      />

      <form className="conversation-assignment" action={assignConversationAction}>
        <input name="conversationId" type="hidden" value={detail.id} />
        <label>
          Ditangani oleh
          <select
            name="assigneeUserId"
            defaultValue={detail.assignedToUser?.id ?? ""}
          >
            <option value="">Belum ditugaskan</option>
            {detail.assignableUsers.map((user) => (
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

      {detail.lead ? (
        <div className="card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">{detail.lead.source}</p>
              <h2>Lead snapshot · {detail.lead.qualificationScore ?? 0}/100</h2>
            </div>
          </div>
          <p>{detail.lead.needSummary}</p>
          <p className="muted">
            {[
              detail.lead.serviceInterest,
              detail.lead.location,
              detail.lead.budget,
              detail.lead.urgency,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <form className="owner-notes-form" action={updateConversationNotesAction}>
        <input name="conversationId" type="hidden" value={detail.id} />
        <label>
          Internal owner notes
          <textarea name="ownerNotes" defaultValue={detail.ownerNotes ?? ""} />
        </label>
        <button className="ghost-button" type="submit">
          Save notes
        </button>
      </form>

      <ChatMessageThread
        conversationId={detail.id}
        hasOlderMessages={detail.hasOlderMessages}
        messageLimit={detail.messageLimit}
        messages={detail.messages}
      />

      {detail.channel === "WHATSAPP" &&
      !isWhatsAppCustomerCareWindowOpen(detail.lastCustomerMessageAt) ? (
        <details className="whatsapp-template-panel">
          <summary>Kirim template WhatsApp di luar jendela 24 jam</summary>
          <form className="form-grid" action={sendWhatsAppTemplateAction}>
            <input name="conversationId" type="hidden" value={detail.id} />
            <label>
              Nama template Meta
              <input
                name="templateName"
                pattern="[a-z0-9_]{1,512}"
                placeholder="follow_up_customer"
                required
              />
            </label>
            <label>
              Bahasa
              <input name="languageCode" defaultValue="id" required />
            </label>
            <label className="span-2">
              Parameter body <small>(satu per baris)</small>
              <textarea name="bodyParameters" rows={3} />
            </label>
            <button className="primary-button span-2" type="submit">
              Kirim approved template
            </button>
          </form>
        </details>
      ) : null}

      {props.quickReplies.length > 0 ? (
        <form className="quick-reply-strip" action={sendOwnerReplyAction}>
          <input name="conversationId" type="hidden" value={detail.id} />
          <select name="message" defaultValue="" required>
            <option value="" disabled>
              Pilih template balasan
            </option>
            {props.quickReplies.map((reply) => (
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

      <ChatReplyComposer
        conversationId={detail.id}
        quickReplies={props.quickReplies}
        blockedReason={freeformBlockReason}
      />
    </section>
  );
}

*/
function ClientConversationPanel(props: {
  detail: ConversationDetail;
  quickReplies: QuickReply[];
  loading: boolean;
  readOnly: boolean;
}) {
  const { detail } = props;
  const outsideWhatsAppWindow =
    detail.channel === "WHATSAPP" &&
    !isWhatsAppCustomerCareWindowOpen(detail.lastCustomerMessageAt);

  return (
    <section className={props.loading ? "chat-detail-surface conversation-panel-loading" : "chat-detail-surface"}>
      <div className="chat-detail-header">
        <div className="chat-contact-identity">
          <span className="chat-contact-avatar" aria-hidden="true">{detail.contactName.slice(0, 1).toUpperCase()}</span>
          <div>
            <h1>{detail.contactName}</h1>
            <p>{formatAddress(detail.channel, detail.contactPhone)}</p>
          </div>
        </div>
        <span className={detail.status === "HUMAN_NEEDED" ? "status status-warning" : "status"}>
          {formatLabel(detail.status)}
        </span>
      </div>

      <div className="chat-detail-body">
        <div className="chat-conversation-column">
          <ChatMessageThread
            conversationId={detail.id}
            hasOlderMessages={detail.hasOlderMessages}
            messageLimit={detail.messageLimit}
            messages={detail.messages}
          />

          {!props.readOnly && outsideWhatsAppWindow ? (
            <details className="whatsapp-template-panel">
              <summary>Kirim template WhatsApp di luar jendela 24 jam</summary>
              <form className="form-grid" action={sendWhatsAppTemplateAction}>
                <input name="conversationId" type="hidden" value={detail.id} />
                <label>Nama template Meta<input name="templateName" pattern="[a-z0-9_]{1,512}" placeholder="follow_up_customer" required /></label>
                <label>Bahasa<input name="languageCode" defaultValue="id" required /></label>
                <label className="span-2">Parameter body <small>(satu per baris)</small><textarea name="bodyParameters" rows={3} /></label>
                <button className="primary-button span-2" type="submit">Kirim approved template</button>
              </form>
            </details>
          ) : null}

          {!props.readOnly && props.quickReplies.length > 0 ? (
            <details className="quick-reply-strip">
              <summary>Gunakan balasan cepat</summary>
              <form action={sendOwnerReplyAction}>
                <input name="conversationId" type="hidden" value={detail.id} />
                <select name="message" defaultValue="" required aria-label="Pilih balasan cepat">
                  <option value="" disabled>Pilih template balasan</option>
                  {props.quickReplies.map((reply) => (
                    <option key={reply.id} value={reply.content}>
                      {reply.shortcut ?? reply.name} — {reply.content.slice(0, 80)}
                    </option>
                  ))}
                </select>
                <button className="small-outline-button" type="submit">Kirim</button>
              </form>
            </details>
          ) : null}

          {props.readOnly ? (
            <div className="settings-note" role="status">
              <strong>Mode hanya lihat</strong>
              <p>Viewer dapat membaca riwayat chat, tetapi tidak dapat membalas atau mengubah status.</p>
            </div>
          ) : (
            <ChatReplyComposer
              conversationId={detail.id}
              quickReplies={props.quickReplies}
              blockedReason={outsideWhatsAppWindow ? "Jendela layanan WhatsApp 24 jam sudah berakhir. Kirim approved template Meta, atau tunggu pelanggan mengirim pesan baru." : null}
            />
          )}
        </div>

        <aside className="chat-context-panel" aria-label="Detail percakapan">
          {!props.readOnly ? <section className="chat-context-section chat-context-controls">
            <div className="chat-context-heading">
              <div><strong>Kendali chat</strong><span>Atur siapa yang menjawab pelanggan.</span></div>
              <ConversationModeControls conversationId={detail.id} status={detail.status} />
            </div>
          </section> : null}

          {!props.readOnly ? <details className="chat-context-section" open>
            <summary>Penanggung jawab</summary>
            <form className="conversation-assignment" action={assignConversationAction}>
              <input name="conversationId" type="hidden" value={detail.id} />
              <select name="assigneeUserId" defaultValue={detail.assignedToUser?.id ?? ""} aria-label="Ditangani oleh">
                <option value="">Belum ditugaskan</option>
                {detail.assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <button className="small-outline-button" type="submit">Simpan</button>
            </form>
          </details> : null}

          {detail.lead ? (
            <details className="chat-context-section" open>
              <summary><span>Ringkasan lead</span><span className="context-score">{detail.lead.qualificationScore ?? 0}/100</span></summary>
              <p className="lead-summary">{detail.lead.needSummary}</p>
              <dl className="lead-facts">
                <div><dt>Layanan</dt><dd>{detail.lead.serviceInterest ?? "-"}</dd></div>
                <div><dt>Lokasi</dt><dd>{detail.lead.location ?? "-"}</dd></div>
                <div><dt>Budget</dt><dd>{detail.lead.budget ?? "-"}</dd></div>
                <div><dt>Urgensi</dt><dd>{detail.lead.urgency ?? "-"}</dd></div>
              </dl>
            </details>
          ) : null}

          {!props.readOnly ? <details className="chat-context-section">
            <summary>Catatan internal</summary>
            <form className="owner-notes-form" action={updateConversationNotesAction}>
              <input name="conversationId" type="hidden" value={detail.id} />
              <textarea name="ownerNotes" defaultValue={detail.ownerNotes ?? ""} placeholder="Follow up besok, minta foto lokasi..." aria-label="Catatan internal" />
              <button className="small-outline-button" type="submit">Simpan catatan</button>
            </form>
          </details> : null}
        </aside>
      </div>
    </section>
  );
}

function formatAddress(channel: string, value: string) {
  if (channel === "TELEGRAM") return value.replace(/^telegram:/i, "Telegram ");
  if (channel === "WEB_CHAT") return "Website live chat";
  return value;
}

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function bubbleClass(sender: string) {
  if (sender === "CUSTOMER") return "customer";
  if (sender === "AI") return "ai";
  if (sender === "SYSTEM") return "system";
  return "owner";
}

function deliveryLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Menunggu dikirim",
    SENDING: "Mengirim",
    ACCEPTED: "Terkirim",
    DELIVERED: "Diterima",
    READ: "Dibaca",
    FAILED: "Gagal",
    UNKNOWN: "Status belum pasti",
    SUPPRESSED: "Tidak dikirim",
    STORED: "Tersimpan",
  };
  return labels[status] ?? status;
}
