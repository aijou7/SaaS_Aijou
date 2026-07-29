"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  assignConversationAction,
  releaseConversationAction,
  resolveConversationAction,
  sendOwnerReplyAction,
  sendWhatsAppTemplateAction,
  takeoverConversationAction,
  updateConversationNotesAction,
} from "@/app/conversations/actions";
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
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(
    props.initialDetail,
  );
  const [hasClientSelection, setHasClientSelection] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleStart = () => setLoading(true);
    const handleLoaded = (event: Event) => {
      setDetail((event as CustomEvent<ConversationDetail>).detail);
      setHasClientSelection(true);
      setLoading(false);
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
        .finally(() => setLoading(false));
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
    />
  );
}

function ClientConversationPanel(props: {
  detail: ConversationDetail;
  quickReplies: QuickReply[];
  loading: boolean;
}) {
  const { detail } = props;
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

      <div className="handoff-actions">
        <ConversationAction
          action={takeoverConversationAction}
          conversationId={detail.id}
          label="Ambil alih chat"
          primary
        />
        <ConversationAction
          action={releaseConversationAction}
          conversationId={detail.id}
          label="Aktifkan AI lagi"
        />
        <ConversationAction
          action={resolveConversationAction}
          conversationId={detail.id}
          label="Mark resolved"
        />
      </div>

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

      <div className="chat-window">
        {detail.hasOlderMessages ? (
          <a
            className="small-outline-button chat-history-link"
            href={`/conversations?conversationId=${encodeURIComponent(
              detail.id,
            )}&history=${Math.min(500, detail.messageLimit + 50)}`}
          >
            Muat 50 pesan sebelumnya
          </a>
        ) : null}
        {detail.messages.map((message) => (
          <div
            className={`chat-bubble ${bubbleClass(message.senderType)}`}
            key={message.id}
          >
            <small>{formatLabel(message.senderType)}</small>
            {message.media ? (
              message.media.available ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="chat-media-preview"
                  src={message.media.url}
                  alt="Lampiran customer"
                  loading="lazy"
                />
              ) : (
                <span className="chat-media-unavailable">
                  Lampiran belum tersimpan permanen
                </span>
              )
            ) : null}
            {message.messageBody ? <p>{message.messageBody}</p> : null}
            {!["CUSTOMER", "SYSTEM"].includes(message.senderType) ? (
              <span
                className={
                  ["FAILED", "UNKNOWN"].includes(message.deliveryStatus)
                    ? "message-delivery failed"
                    : "message-delivery"
                }
                title={message.deliveryError ?? undefined}
              >
                {deliveryLabel(message.deliveryStatus)}
              </span>
            ) : null}
          </div>
        ))}
      </div>

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

      <form className="reply-form" action={sendOwnerReplyAction}>
        <input name="conversationId" type="hidden" value={detail.id} />
        <input
          name="message"
          maxLength={4096}
          placeholder="Balas sebagai tim..."
          required
        />
        <button className="primary-button" type="submit">
          Send
        </button>
      </form>
    </section>
  );
}

function ConversationAction(props: {
  action: (formData: FormData) => void | Promise<void>;
  conversationId: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={props.action}>
      <input name="conversationId" type="hidden" value={props.conversationId} />
      <button
        className={props.primary ? "primary-button" : "ghost-button"}
        type="submit"
      >
        {props.label}
      </button>
    </form>
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
