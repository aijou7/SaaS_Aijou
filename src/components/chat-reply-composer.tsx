"use client";

import { Send, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { sendOwnerReplyUiAction, type ConversationReplyState } from "@/app/conversations/actions";
import { showToast } from "@/components/toast-center";

const initialState: ConversationReplyState = { ok: false, message: "", nonce: 0 };

export function ChatReplyComposer(props: {
  conversationId: string;
  quickReplies: Array<{ id: string; name: string; content: string; shortcut: string | null }>;
}) {
  const [state, action, pending] = useActionState(sendOwnerReplyUiAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
      {props.quickReplies.length > 0 ? (
        <div className="quick-reply-pills" aria-label="Balasan cepat">
          <Sparkles size={15} aria-hidden="true" />
          {props.quickReplies.slice(0, 6).map((reply) => (
            <button key={reply.id} type="button" onClick={() => {
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
      <form className="reply-form" action={action} ref={formRef}>
        <input name="conversationId" type="hidden" value={props.conversationId} />
        <label className="sr-only" htmlFor={`reply-${props.conversationId}`}>Balas sebagai tim</label>
        <textarea
          id={`reply-${props.conversationId}`}
          name="message"
          maxLength={4096}
          placeholder="Tulis balasan sebagai tim…"
          required
          rows={1}
          ref={inputRef}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="primary-button" type="submit" disabled={pending}>
          <Send size={17} aria-hidden="true" />
          {pending ? "Mengirim…" : "Kirim"}
        </button>
      </form>
      <small className="composer-hint">Enter untuk kirim · Shift + Enter untuk baris baru</small>
    </div>
  );
}
