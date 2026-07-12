"use client";

import { useActionState } from "react";
import {
  createBetaInviteAction,
  type InviteActionState,
} from "@/app/beta/invites/actions";

const initialState: InviteActionState = {};

export function InviteForm() {
  const [state, action, pending] = useActionState(createBetaInviteAction, initialState);

  return (
    <form className="form-grid" action={action}>
      <label className="span-2">
        Email tester (opsional)
        <input name="email" type="email" maxLength={254} placeholder="tester@bisnis.com" />
      </label>
      <label className="span-2">
        Nama bisnis awal (opsional)
        <input name="businessName" type="text" maxLength={120} placeholder="Nama bisnis tester" />
      </label>
      <label>
        Berlaku
        <select name="expiresInDays" defaultValue="7">
          <option value="1">1 hari</option>
          <option value="7">7 hari</option>
          <option value="14">14 hari</option>
          <option value="30">30 hari</option>
        </select>
      </label>
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? "Membuat..." : "Buat beta invite"}
      </button>
      {state.error ? <p className="span-2 settings-note" role="alert">{state.error}</p> : null}
      {state.inviteUrl ? (
        <label className="span-2">
          Link sekali pakai
          <textarea value={state.inviteUrl} readOnly rows={3} />
        </label>
      ) : null}
    </form>
  );
}
