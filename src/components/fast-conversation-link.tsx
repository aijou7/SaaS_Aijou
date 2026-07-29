"use client";

import {
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

const detailCache = new Map<string, { expiresAt: number; value: unknown }>();
const detailRequests = new Map<string, Promise<unknown>>();
const detailCacheMs = 8_000;

export function FastConversationLink(props: {
  conversationId: string;
  href: string;
  className: string;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("conversationId"),
  );

  useEffect(() => {
    const handleLoaded = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) setActiveId(detail.id);
    };
    window.addEventListener("aijou:conversation-loaded", handleLoaded);
    return () =>
      window.removeEventListener("aijou:conversation-loaded", handleLoaded);
  }, []);

  const load = () => loadConversationDetail(props.conversationId);

  return (
    <a
      className={
        activeId === props.conversationId
          ? `${props.className} active`
          : props.className.replace(/\sactive\b/g, "")
      }
      href={props.href}
      onMouseEnter={() => void load()}
      onFocus={() => void load()}
      onClick={(event) => {
        if (!isPlainLeftClick(event)) return;
        event.preventDefault();
        window.dispatchEvent(
          new CustomEvent("aijou:conversation-load-start", {
            detail: { id: props.conversationId },
          }),
        );
        void load()
          .then((detail) => {
            window.history.pushState({}, "", props.href);
            window.dispatchEvent(
              new CustomEvent("aijou:conversation-loaded", { detail }),
            );
          })
          .catch(() => {
            window.location.assign(props.href);
          });
      }}
    >
      {props.children}
    </a>
  );
}

export async function loadConversationDetail(
  conversationId: string,
  history = 50,
  force = false,
) {
  const key = `${conversationId}:${history}`;
  const cached = detailCache.get(key);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;
  const existing = detailRequests.get(key);
  if (existing) return existing;

  const request = fetch(
    `/api/inbox/conversations/${encodeURIComponent(
      conversationId,
    )}?history=${history}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    },
  )
    .then(async (response) => {
      if (!response.ok) throw new Error(`detail_http_${response.status}`);
      const value: unknown = await response.json();
      detailCache.set(key, { expiresAt: Date.now() + detailCacheMs, value });
      return value;
    })
    .finally(() => detailRequests.delete(key));
  detailRequests.set(key, request);
  return request;
}

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}
