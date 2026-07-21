"use client";

import { useActionState } from "react";
import {
  createTeamInviteAction,
  type TeamInviteActionState,
} from "@/app/team/actions";
import type { WorkspaceRoleValue } from "@/lib/team-invites";

const initialState: TeamInviteActionState = {};

type TeamInviteFormProps = {
  managerRole: WorkspaceRoleValue;
};

export function TeamInviteForm({ managerRole }: TeamInviteFormProps) {
  const [state, action, pending] = useActionState(createTeamInviteAction, initialState);
  const roles = managerRole === "OWNER"
    ? ["ADMIN", "AGENT", "VIEWER"] as const
    : ["AGENT", "VIEWER"] as const;

  return (
    <form className="form-grid" action={action}>
      <label className="span-2">
        Email anggota
        <input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="anggota@bisnis.com"
          spellCheck={false}
          required
        />
      </label>
      <label>
        Akses
        <select name="role" defaultValue={roles[0]} required>
          {roles.map((role) => (
            <option value={role} key={role}>
              {formatRoleOption(role)}
            </option>
          ))}
        </select>
      </label>
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Mengirim..." : "Kirim undangan"}
      </button>

      {state.error ? (
        <div className="settings-note span-2" role="alert">
          <strong>Undangan belum dibuat</strong>
          <p>{state.error}</p>
        </div>
      ) : null}

      {state.inviteUrl ? (
        <div className="settings-note span-2" role="status">
          <strong>Undangan siap</strong>
          <p>{state.deliveryMessage}</p>
          <label>
            Link sekali pakai, berlaku 7 hari
            <textarea value={state.inviteUrl} readOnly rows={3} aria-label="Link undangan tim" />
          </label>
        </div>
      ) : null}
    </form>
  );
}

function formatRoleOption(role: "ADMIN" | "AGENT" | "VIEWER") {
  const labels = {
    ADMIN: "Admin — kelola tim dan workspace",
    AGENT: "Agent — tangani percakapan",
    VIEWER: "Viewer — akses baca",
  } as const;
  return labels[role];
}
