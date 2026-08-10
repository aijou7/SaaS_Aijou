"use client";

import { Bot, CheckCircle2, MoreHorizontal, UserRoundCheck } from "lucide-react";
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

  const primaryMode: ConversationMode = displayStatus === "OPEN" ? "takeover" : "ai";
  const PrimaryIcon = primaryMode === "takeover" ? UserRoundCheck : Bot;
  const primaryLabel =
    pendingMode === primaryMode
      ? "Memproses..."
      : primaryMode === "takeover"
        ? "Ambil alih"
        : displayStatus === "CLOSED"
          ? "Buka dengan AI"
          : "Aktifkan AI";

  return (
    <div className="conversation-mode-toolbar" aria-label="Kontrol percakapan">
      <button
        className="primary-button"
        type="button"
        disabled={pending}
        onClick={() => updateMode(primaryMode)}
      >
        <PrimaryIcon size={17} aria-hidden="true" />
        {primaryLabel}
      </button>
      <details className="conversation-more-menu">
        <summary aria-label="Aksi percakapan lainnya" title="Aksi lainnya">
          <MoreHorizontal size={19} aria-hidden="true" />
        </summary>
        <div>
          {displayStatus === "CLOSED" ? (
            <button type="button" disabled={pending} onClick={() => updateMode("takeover")}>
              <UserRoundCheck size={16} aria-hidden="true" />
              Buka dan ambil alih
            </button>
          ) : null}
          {displayStatus !== "CLOSED" ? (
            <button type="button" disabled={pending} onClick={() => updateMode("resolved")}>
              <CheckCircle2 size={16} aria-hidden="true" />
              Tandai selesai
            </button>
          ) : null}
        </div>
      </details>
    </div>
  );
}
