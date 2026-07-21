"use client";

import { Bell, Pause, Play, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getInboxPollDelayMs,
  inboxLiveStateChanged,
  isInboxLiveState,
  type InboxLiveState,
} from "@/lib/inbox-live";

type LiveConnectionState =
  | "live"
  | "paused"
  | "offline"
  | "reconnecting"
  | "signed-out";

type InboxLiveRefresherProps = {
  initialState: InboxLiveState;
};

export function InboxLiveRefresher({ initialState }: InboxLiveRefresherProps) {
  const router = useRouter();
  const [connectionState, setConnectionState] =
    useState<LiveConnectionState>("live");
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 8_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (manuallyPaused) return;

    let active = true;
    let timer: number | undefined;
    let request: AbortController | null = null;
    let knownState = initialState;
    let unchangedPolls = 0;
    let failedPolls = 0;

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };

    const schedule = (delayMs: number) => {
      if (!active || document.hidden || !navigator.onLine) return;
      clearTimer();
      timer = window.setTimeout(poll, delayMs);
    };

    const poll = async () => {
      if (!active || request) return;
      if (document.hidden) {
        setConnectionState("paused");
        return;
      }
      if (!navigator.onLine) {
        setConnectionState("offline");
        return;
      }

      request = new AbortController();
      try {
        const response = await fetch("/api/inbox/live", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: request.signal,
        });

        if (response.status === 401) {
          setConnectionState("signed-out");
          return;
        }
        if (!response.ok) throw new Error(`Inbox poll failed (${response.status})`);

        const nextState: unknown = await response.json();
        if (!isInboxLiveState(nextState)) {
          throw new Error("Inbox poll returned an invalid payload");
        }

        failedPolls = 0;
        setConnectionState("live");

        if (inboxLiveStateChanged(knownState, nextState)) {
          const addedHumanQueue = Math.max(
            0,
            nextState.humanNeededCount - knownState.humanNeededCount,
          );
          const addedUnread = Math.max(
            0,
            nextState.unreadCount - knownState.unreadCount,
          );

          knownState = nextState;
          unchangedPolls = 0;
          setNotice(
            addedHumanQueue > 0
              ? `${addedHumanQueue} percakapan baru butuh bantuan tim.`
              : addedUnread > 0
                ? `${addedUnread} pesan baru masuk.`
                : "Inbox diperbarui.",
          );
          router.refresh();
        } else {
          unchangedPolls += 1;
        }

        schedule(getInboxPollDelayMs({ unchangedPolls, failedPolls }));
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        failedPolls += 1;
        setConnectionState(navigator.onLine ? "reconnecting" : "offline");
        schedule(getInboxPollDelayMs({ unchangedPolls, failedPolls }));
      } finally {
        request = null;
      }
    };

    const syncWithBrowser = () => {
      clearTimer();
      request?.abort();
      request = null;

      if (document.hidden) {
        setConnectionState("paused");
        return;
      }
      if (!navigator.onLine) {
        setConnectionState("offline");
        return;
      }

      setConnectionState("live");
      schedule(250);
    };

    document.addEventListener("visibilitychange", syncWithBrowser);
    window.addEventListener("online", syncWithBrowser);
    window.addEventListener("offline", syncWithBrowser);
    syncWithBrowser();

    return () => {
      active = false;
      clearTimer();
      request?.abort();
      document.removeEventListener("visibilitychange", syncWithBrowser);
      window.removeEventListener("online", syncWithBrowser);
      window.removeEventListener("offline", syncWithBrowser);
    };
  }, [initialState, manuallyPaused, router]);

  const displayedConnectionState: LiveConnectionState = manuallyPaused
    ? "paused"
    : connectionState;
  const statusLabel = getConnectionLabel(displayedConnectionState);
  const pendingHuman = initialState.humanNeededCount;

  return (
    <div
      className="chat-live-strip"
      aria-label="Status pembaruan inbox"
      aria-live="polite"
    >
      <button
        className="chat-live-toggle"
        data-state={displayedConnectionState}
        type="button"
        aria-label={manuallyPaused ? "Lanjutkan pembaruan inbox" : "Jeda pembaruan inbox"}
        aria-pressed={manuallyPaused}
        onClick={() => setManuallyPaused((paused) => !paused)}
      >
        <span className="chat-live-dot" aria-hidden="true" />
        <span>{statusLabel}</span>
        {manuallyPaused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}
      </button>

      <Link
        className={pendingHuman > 0 ? "chat-human-queue has-pending" : "chat-human-queue"}
        href="/conversations?status=HUMAN_NEEDED"
        aria-label={`${pendingHuman} percakapan butuh bantuan tim`}
      >
        <Bell size={14} aria-hidden="true" />
        <span>{pendingHuman} butuh tim</span>
      </Link>

      {notice ? (
        <button
          className="chat-live-notice"
          type="button"
          onClick={() => {
            setNotice("");
            router.refresh();
          }}
        >
          <RotateCw size={13} aria-hidden="true" />
          {notice}
        </button>
      ) : null}
    </div>
  );
}

function getConnectionLabel(state: LiveConnectionState) {
  if (state === "paused") return "Dijeda";
  if (state === "offline") return "Offline";
  if (state === "reconnecting") return "Menghubungkan ulang";
  if (state === "signed-out") return "Sesi berakhir";
  return "Live";
}
