"use client";

import { useActionState, useEffect } from "react";
import {
  acceptTeamInviteAction,
  type TeamAcceptActionState,
} from "@/app/team/accept/actions";

const initialState: TeamAcceptActionState = {};

type TeamAcceptFormProps = {
  mode: "existing" | "new";
  token: string;
};

export function TeamAcceptForm({ mode, token }: TeamAcceptFormProps) {
  const [state, action, pending] = useActionState(acceptTeamInviteAction, initialState);

  return (
    <form className="login-form signup-form" action={action}>
      <input name="token" type="hidden" value={token} />

      {mode === "new" ? (
        <>
          <label>
            Nama lengkap
            <input
              name="name"
              type="text"
              minLength={2}
              maxLength={100}
              autoComplete="name"
              required
            />
          </label>
          <div className="auth-field-row">
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Ulangi password
              <input
                name="confirmPassword"
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          </div>
          <p className="auth-form-hint">
            Minimal 12 karakter, gunakan huruf dan angka, serta hindari nama atau emailmu.
          </p>
        </>
      ) : null}

      {state.error ? (
        <div className="settings-note" role="alert">
          <strong>Undangan belum diterima</strong>
          <p>{state.error}</p>
        </div>
      ) : null}

      <button type="submit" disabled={pending} aria-disabled={pending}>
        {pending
          ? "Menghubungkan workspace..."
          : mode === "new"
            ? "Buat akun dan bergabung"
            : "Terima undangan"}
      </button>
    </form>
  );
}

export function InviteTokenCleaner() {
  useInviteTokenCleaner();
  return null;
}

function useInviteTokenCleaner() {
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);
}
