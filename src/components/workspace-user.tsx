"use client";

import { UserCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type WorkspaceUser = {
  name: string;
  email: string;
  role: string | null;
};

export function WorkspaceUserChip() {
  const user = useWorkspaceUser();
  return (
    <Link className="user-chip" href="/account" aria-label="Buka keamanan akun">
      <span className="avatar-dot">
        <UserCircle size={20} aria-hidden="true" />
      </span>
      <strong>{user?.name || "Akun"}</strong>
    </Link>
  );
}

export function WorkspaceUserSummary() {
  const user = useWorkspaceUser();
  return (
    <div className="footer-user">
      <span className="avatar-dot">
        <UserCircle size={22} aria-hidden="true" />
      </span>
      <div>
        <strong>{user?.name || "Akun workspace"}</strong>
        <small>{formatRole(user?.role)}</small>
      </div>
      <span className="online-badge">Online</span>
    </div>
  );
}

function useWorkspaceUser() {
  const [user, setUser] = useState<WorkspaceUser | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.user) setUser(body.user as WorkspaceUser);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  return user;
}

function formatRole(role: string | null | undefined) {
  if (role === "OWNER") return "Workspace owner";
  if (role === "ADMIN") return "Workspace admin";
  if (role === "AGENT") return "Customer-service agent";
  if (role === "VIEWER") return "Read-only viewer";
  return "Workspace member";
}
