import { createHash } from "node:crypto";

export const workspaceRoleValues = ["OWNER", "ADMIN", "AGENT", "VIEWER"] as const;
export type WorkspaceRoleValue = (typeof workspaceRoleValues)[number];

export function parseWorkspaceRole(value: unknown): WorkspaceRoleValue | null {
  return typeof value === "string" && workspaceRoleValues.includes(value as WorkspaceRoleValue)
    ? (value as WorkspaceRoleValue)
    : null;
}

export function canManageWorkspaceRole(
  actorRole: WorkspaceRoleValue,
  targetRole: WorkspaceRoleValue,
) {
  // OWNER represents the single Business.userId and is never an invitation
  // role. Ownership transfer is a separate two-party security operation.
  if (targetRole === "OWNER") return false;
  if (actorRole === "OWNER") return true;
  return actorRole === "ADMIN" && (targetRole === "AGENT" || targetRole === "VIEWER");
}

export function normalizeTeamInviteEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length >= 3 &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : "";
}

export function isTeamInviteToken(value: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(value.trim());
}

export function hashTeamInviteToken(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}
