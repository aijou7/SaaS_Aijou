"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const LAYOUT_STORAGE_KEY = "aijou:conversation-layout";
const DEFAULT_INBOX_WIDTH = 318;
const DEFAULT_CONTEXT_WIDTH = 300;
const MIN_INBOX_WIDTH = 260;
const MAX_INBOX_WIDTH = 460;
const MIN_CONTEXT_WIDTH = 250;
const MAX_CONTEXT_WIDTH = 460;

type ConversationLayoutContextValue = {
  contextOpen: boolean;
  setContextOpen: (open: boolean) => void;
  contextWidth: number;
  setContextWidth: (width: number) => void;
};

const ConversationLayoutContext = createContext<ConversationLayoutContextValue | null>(null);

export function useConversationLayout() {
  const context = useContext(ConversationLayoutContext);

  if (!context) {
    throw new Error("useConversationLayout must be used inside ConversationWorkspace.");
  }

  return context;
}

export function ConversationWorkspace(props: { leftPanel: ReactNode; children: ReactNode }) {
  const [inboxWidth, setInboxWidth] = useState(DEFAULT_INBOX_WIDTH);
  const [contextWidth, setContextWidth] = useState(DEFAULT_CONTEXT_WIDTH);
  const [contextOpen, setContextOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [layoutHydrated, setLayoutHydrated] = useState(false);

  useEffect(() => {
    const applyStoredLayout = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "null") as {
          inboxWidth?: number;
          contextWidth?: number;
          contextOpen?: boolean;
          leftOpen?: boolean;
        } | null;

        if (stored) {
          if (typeof stored.inboxWidth === "number") setInboxWidth(clamp(stored.inboxWidth, MIN_INBOX_WIDTH, MAX_INBOX_WIDTH));
          if (typeof stored.contextWidth === "number") setContextWidth(clamp(stored.contextWidth, MIN_CONTEXT_WIDTH, MAX_CONTEXT_WIDTH));
          if (typeof stored.contextOpen === "boolean") setContextOpen(stored.contextOpen);
          if (typeof stored.leftOpen === "boolean") setLeftOpen(stored.leftOpen);
        }
      } catch {
        // A blocked or malformed localStorage entry should not prevent the inbox from rendering.
      } finally {
        setLayoutHydrated(true);
      }
    };

    const timer = window.setTimeout(applyStoredLayout, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!layoutHydrated) return;

    try {
      localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({ inboxWidth, contextWidth, contextOpen, leftOpen }),
      );
    } catch {
      // Layout preferences are best-effort only.
    }
  }, [contextOpen, contextWidth, inboxWidth, layoutHydrated, leftOpen]);

  const layoutContext = useMemo(
    () => ({ contextOpen, setContextOpen, contextWidth, setContextWidth }),
    [contextOpen, contextWidth],
  );
  const style = {
    "--chat-inbox-width": `${inboxWidth}px`,
    "--chat-context-width": `${contextWidth}px`,
  } as CSSProperties;

  return (
    <ConversationLayoutContext.Provider value={layoutContext}>
      <section
        className={`${leftOpen ? "chat-page" : "chat-page chat-page-left-collapsed"}${contextOpen ? "" : " chat-page-context-collapsed"}`}
        style={style}
      >
        <div className="chat-inbox-shell">
          {leftOpen ? (
            props.leftPanel
          ) : (
            <div className="chat-layout-collapsed-rail">
              <button
                className="chat-layout-toggle"
                type="button"
                onClick={() => setLeftOpen(true)}
                aria-label="Tampilkan daftar percakapan"
                title="Tampilkan daftar percakapan"
              >
                <span aria-hidden="true">›</span>
              </button>
              <span className="chat-layout-rail-label">Daftar chat</span>
            </div>
          )}
        </div>

        <ConversationColumnResizer
          label="Atur lebar daftar percakapan"
          value={inboxWidth}
          min={MIN_INBOX_WIDTH}
          max={MAX_INBOX_WIDTH}
          onChange={setInboxWidth}
          onCollapse={() => setLeftOpen(false)}
        />

        {props.children}
      </section>
    </ConversationLayoutContext.Provider>
  );
}

export function ConversationContextResizer() {
  const { contextWidth, setContextWidth } = useConversationLayout();

  return (
    <ConversationColumnResizer
      label="Atur lebar detail percakapan"
      value={contextWidth}
      min={MIN_CONTEXT_WIDTH}
      max={MAX_CONTEXT_WIDTH}
      onChange={setContextWidth}
      direction="context"
    />
  );
}

export function ConversationLayoutToggle(props: { compact?: boolean }) {
  const { contextOpen, setContextOpen } = useConversationLayout();

  return (
    <button
      className={props.compact ? "chat-layout-toggle chat-layout-toggle-compact" : "chat-layout-toggle"}
      type="button"
      onClick={() => setContextOpen(!contextOpen)}
      aria-label={contextOpen ? "Sembunyikan detail percakapan" : "Tampilkan detail percakapan"}
      title={contextOpen ? "Sembunyikan detail" : "Tampilkan detail"}
    >
      <span aria-hidden="true">{contextOpen ? "‹" : "›"}</span>
    </button>
  );
}

function ConversationColumnResizer(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onCollapse?: () => void;
  direction?: "inbox" | "context";
}) {
  const direction = props.direction ?? "inbox";

  const changeBy = (amount: number) => {
    props.onChange(clamp(props.value + amount, props.min, props.max));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startValue = props.value;
    const sign = direction === "context" ? -1 : 1;

    const handleMove = (moveEvent: PointerEvent) => {
      props.onChange(clamp(startValue + (moveEvent.clientX - startX) * sign, props.min, props.max));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      document.body.classList.remove("is-resizing-conversation");
    };

    document.body.classList.add("is-resizing-conversation");
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp, { once: true });
  };

  return (
    <button
      className={direction === "context" ? "chat-column-resizer chat-column-resizer-context" : "chat-column-resizer"}
      type="button"
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={Math.round(props.value)}
      title={`${props.label}. Seret untuk mengubah ukuran.`}
      onPointerDown={handlePointerDown}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          changeBy(direction === "context" ? 16 : -16);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          changeBy(direction === "context" ? -16 : 16);
        }
        if (event.key === "Home") {
          event.preventDefault();
          props.onChange(props.min);
        }
        if (event.key === "End") {
          event.preventDefault();
          props.onChange(props.max);
        }
      }}
    >
      <span aria-hidden="true" />
      {props.onCollapse ? (
        <span className="chat-resizer-collapse" aria-hidden="true" onClick={props.onCollapse}>
          ‹
        </span>
      ) : null}
    </button>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
