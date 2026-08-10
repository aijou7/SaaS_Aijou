import type { WorkspaceRoleValue } from "@/lib/team-invites";

export type WorkspaceCapability =
  | "account:view"
  | "ai:view"
  | "ai:manage"
  | "automation:manage"
  | "dashboard:view"
  | "finance:view"
  | "inbox:view"
  | "inbox:operate"
  | "operations:view"
  | "operations:operate"
  | "sales:view"
  | "sales:operate"
  | "team:manage"
  | "workspace:manage";

const allCapabilities: readonly WorkspaceCapability[] = [
  "account:view",
  "ai:view",
  "ai:manage",
  "automation:manage",
  "dashboard:view",
  "finance:view",
  "inbox:view",
  "inbox:operate",
  "operations:view",
  "operations:operate",
  "sales:view",
  "sales:operate",
  "team:manage",
  "workspace:manage",
];

const roleCapabilities: Record<WorkspaceRoleValue, ReadonlySet<WorkspaceCapability>> = {
  OWNER: new Set(allCapabilities),
  ADMIN: new Set(allCapabilities),
  AGENT: new Set([
    "account:view",
    "ai:view",
    "inbox:view",
    "inbox:operate",
    "operations:view",
    "operations:operate",
    "sales:view",
    "sales:operate",
  ]),
  VIEWER: new Set([
    "account:view",
    "ai:view",
    "dashboard:view",
    "finance:view",
    "inbox:view",
    "operations:view",
    "sales:view",
  ]),
};

export function canWorkspace(
  role: WorkspaceRoleValue | null | undefined,
  capability: WorkspaceCapability,
) {
  return role ? roleCapabilities[role].has(capability) : false;
}

export function getWorkspaceHome(role: WorkspaceRoleValue | null | undefined) {
  return role === "AGENT" ? "/conversations" : "/dashboard";
}

export function isWorkspaceReadOnly(role: WorkspaceRoleValue | null | undefined) {
  return role === "VIEWER";
}

export function getWorkspaceRoleLabel(role: WorkspaceRoleValue | null | undefined) {
  const labels: Record<WorkspaceRoleValue, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    AGENT: "Agent",
    VIEWER: "Hanya lihat",
  };

  return role ? labels[role] : "Tanpa akses";
}
