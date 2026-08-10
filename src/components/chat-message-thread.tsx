"use client";

import { useLayoutEffect, useRef } from "react";

type ChatMessage = {
  id: string;
  senderType: string;
  messageBody: string;
  deliveryStatus: string;
  deliveryError: string | null;
  createdAt?: string;
  media: { url: string; available: boolean } | null;
};

export function ChatMessageThread(props: {
  conversationId: string;
  hasOlderMessages: boolean;
  messageLimit: number;
  messages: ChatMessage[];
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const newestMessageId = props.messages.at(-1)?.id ?? "empty";
  const positionRef = useRef({
    conversationId: "",
    newestMessageId: "",
    scrollTop: 0,
    pinnedToBottom: true,
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const previous = positionRef.current;
    const conversationChanged = previous.conversationId !== props.conversationId;
    const newestChanged = previous.newestMessageId !== newestMessageId;

    if (conversationChanged || newestChanged || previous.pinnedToBottom) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
    } else {
      const maximumScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTop = Math.min(previous.scrollTop, maximumScrollTop);
    }

    positionRef.current = {
      conversationId: props.conversationId,
      newestMessageId,
      scrollTop: viewport.scrollTop,
      pinnedToBottom:
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48,
    };
  });

  return (
    <div
      className="chat-window"
      ref={viewportRef}
      aria-live="polite"
      aria-label="Riwayat percakapan"
      onScroll={(event) => {
        const viewport = event.currentTarget;
        positionRef.current.scrollTop = viewport.scrollTop;
        positionRef.current.pinnedToBottom =
          viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 48;
      }}
    >
      {props.hasOlderMessages ? (
        <a
          className="small-outline-button chat-history-link"
          href={`/conversations?conversationId=${encodeURIComponent(props.conversationId)}&history=${Math.min(500, props.messageLimit + 50)}`}
        >
          Muat 50 pesan sebelumnya
        </a>
      ) : null}
      {props.messages.map((message) => (
        <div className={`chat-bubble ${bubbleClass(message.senderType)}`} key={message.id}>
          <div className="chat-bubble-meta">
            <small>{formatLabel(message.senderType)}</small>
            {message.createdAt ? <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time> : null}
          </div>
          {message.media ? (
            message.media.available ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="chat-media-preview" src={message.media.url} alt="Lampiran percakapan" loading="lazy" />
            ) : (
              <span className="chat-media-unavailable">Lampiran belum tersimpan permanen</span>
            )
          ) : null}
          {message.messageBody ? <p>{message.messageBody}</p> : null}
          {!['CUSTOMER', 'SYSTEM'].includes(message.senderType) ? (
            <span
              className={['FAILED', 'UNKNOWN'].includes(message.deliveryStatus) ? "message-delivery failed" : "message-delivery"}
              title={message.deliveryError ?? undefined}
            >
              {deliveryLabel(message.deliveryStatus)}
            </span>
          ) : null}
        </div>
      ))}
      <div className="chat-bottom-anchor" aria-hidden="true" />
    </div>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function formatLabel(value: string) {
  if (value === "CUSTOMER") return "Pelanggan";
  if (value === "USER") return "Tim";
  if (value === "AI") return "AI Agent";
  return "Sistem";
}
function bubbleClass(sender: string) {
  if (sender === "CUSTOMER") return "customer";
  if (sender === "AI") return "ai";
  if (sender === "SYSTEM") return "system";
  return "owner";
}
function deliveryLabel(status: string) {
  return ({ PENDING: "Menunggu", SENDING: "Mengirim", ACCEPTED: "Terkirim", DELIVERED: "Diterima", READ: "Dibaca", FAILED: "Gagal", UNKNOWN: "Belum pasti", SUPPRESSED: "Tidak dikirim", STORED: "Tersimpan" } as Record<string, string>)[status] ?? status;
}
