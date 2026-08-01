"use client";

import { useState, useTransition } from "react";
import {
  updateConversationModeUiAction,
  type ConversationMode,
} from "@/app/conversations/actions";
import { showToast } from "@/components/toast-center";

export function ConversationModeControls(props: {
  conversationId: string;
  status: string;
}) {
  const [optimisticStatus, setOptimisticStatus] = useState<{
    conversationId: string;
    baseStatus: string;
    nextStatus: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingMode, setPendingMode] = useState<ConversationMode | null>(null);
  const displayStatus =
    optimisticStatus?.conversationId === props.conversationId &&
    optimisticStatus.baseStatus === props.status
      ? optimisticStatus.nextStatus
      : props.status;

  const updateMode = (mode: ConversationMode) => {
    setPendingMode(mode);
    startTransition(async () => {
      try {
        const result = await updateConversationModeUiAction(props.conversationId, mode);
        if (!result.ok) {
          showToast(result.message, "error");
          return;
        }

        setOptimisticStatus({
          conversationId: props.conversationId,
          baseStatus: props.status,
          nextStatus:
            mode === "takeover" ? "HUMAN_NEEDED" : mode === "ai" ? "OPEN" : "CLOSED",
        });
        showToast(result.message);
        window.dispatchEvent(new Event("aijou:inbox-state-changed"));
      } catch {
        showToast("Status percakapan gagal diubah. Coba lagi.", "error");
      } finally {
        setPendingMode(null);
      }
    });
  };

  return (
    <div className="handoff-actions" aria-label="Kontrol percakapan">
      <button
        className="primary-button"
        type="button"
        disabled={pending || displayStatus === "HUMAN_NEEDED"}
        onClick={() => updateMode("takeover")}
      >
        {pendingMode === "takeover" ? "Mengambil alih…" : "Ambil alih chat"}
      </button>
      <button
        className="ghost-button"
        type="button"
        disabled={pending || displayStatus === "OPEN"}
        onClick={() => updateMode("ai")}
      >
        {pendingMode === "ai" ? "Mengaktifkan…" : "Aktifkan AI lagi"}
      </button>
      <button
        className="ghost-button"
        type="button"
        disabled={pending || displayStatus === "CLOSED"}
        onClick={() => updateMode("resolved")}
      >
        {pendingMode === "resolved" ? "Menyimpan…" : "Tandai selesai"}
      </button>
    </div>
  );
}
