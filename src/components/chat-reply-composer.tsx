"use client";

import { ClockAlert, Send, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { sendOwnerReplyUiAction, type ConversationReplyState } from "@/app/conversations/actions";
import { showToast } from "@/components/toast-center";

const initialState: ConversationReplyState = { ok: false, message: "", nonce: 0 };

export function ChatReplyComposer(props: {
  conversationId: string;
  quickReplies: Array<{ id: string; name: string; content: string; shortcut: string | null }>;
  blockedReason?: string | null;
}) {
  const [state, action, pending] = useActionState(sendOwnerReplyUiAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blocked = Boolean(props.blockedReason);

  useEffect(() => {
    if (!state.nonce) return;
    if (state.ok) {
      formRef.current?.reset();
      showToast("Balasan berhasil dikirim.");
      window.dispatchEvent(new Event("aijou:inbox-state-changed"));
      inputRef.current?.focus();
    } else {
      showToast(state.message || "Balasan gagal dikirim.", "error");
    }
  }, [state]);

  return (
    <div className="chat-composer-shell">
      {props.quickReplies.length > 0 && !blocked ? (
        <div className="quick-reply-pills" aria-label="Balasan cepat">
          <Sparkles size={15} aria-hidden="true" />
          {props.quickReplies.slice(0, 6).map((reply) => (
            <button key={reply.id} type="button" disabled={blocked || pending} onClick={() => {
              if (inputRef.current) {
                inputRef.current.value = reply.content;
                inputRef.current.focus();
              }
            }}>
              {reply.shortcut ?? reply.name}
            </button>
          ))}
        </div>
      ) : null}
      {props.blockedReason ? (
        <div className="composer-blocked-notice" id={`reply-status-${props.conversationId}`} role="status">
          <ClockAlert size={17} aria-hidden="true" />
          <span>{props.blockedReason}</span>
        </div>
      ) : null}
      <form
        className="reply-form"
        action={action}
        ref={formRef}
        onSubmit={(event) => {
          if (blocked) event.preventDefault();
        }}
      >
        <input name="conversationId" type="hidden" value={props.conversationId} />
        <label className="sr-only" htmlFor={`reply-${props.conversationId}`}>Balas sebagai tim</label>
        <textarea
          id={`reply-${props.conversationId}`}
          name="message"
          maxLength={4096}
          placeholder={blocked ? "Gunakan approved template Meta di atas" : "Tulis balasan sebagai tim…"}
          required
          rows={1}
          ref={inputRef}
          disabled={blocked || pending}
          aria-describedby={props.blockedReason ? `reply-status-${props.conversationId}` : undefined}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="primary-button" type="submit" disabled={blocked || pending}>
          <Send size={17} aria-hidden="true" />
          {pending ? "Mengirim…" : "Kirim"}
        </button>
      </form>
      <small className="composer-hint">
        {blocked ? "Pesan bebas aktif lagi setelah pelanggan membalas." : "Enter untuk kirim · Shift + Enter untuk baris baru"}
      </small>
    </div>
  );
}
