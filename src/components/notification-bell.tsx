"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function NotificationBell() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const refresh = async () => {
      try {
        const response = await fetch("/api/notifications?limit=1", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body = (await response.json()) as { unread?: unknown };
        if (active && Number.isSafeInteger(body.unread)) {
          setUnread(Math.max(0, Number(body.unread)));
        }
      } catch {
        // The inbox remains usable when notification polling is unavailable.
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  return (
    <Link
      className="top-icon-button notification-bell"
      href="/notifications"
      aria-label={`${unread} notifikasi belum dibaca`}
      data-tooltip="Notifikasi"
    >
      <Bell size={17} aria-hidden="true" />
      {unread > 0 ? (
        <span className="notification-count" aria-hidden="true">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
