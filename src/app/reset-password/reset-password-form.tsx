"use client";

import { useActionState, useEffect } from "react";
import {
  resetPasswordAction,
  type ResetPasswordActionState,
} from "@/app/reset-password/actions";

const initialState: ResetPasswordActionState = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initialState);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <form className="login-form" action={action}>
      <input name="token" type="hidden" value={token} />
      <label>
        Password baru
        <input
          aria-describedby="reset-password-hint"
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Ulangi password baru
        <input
          name="confirmPassword"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <p className="auth-form-hint" id="reset-password-hint">
        Minimal 12 karakter serta memuat huruf dan angka.
      </p>
      {state.error ? (
        <div className="settings-note" role="alert">
          <strong>Password belum diubah</strong>
          <p>{state.error}</p>
        </div>
      ) : null}
      <button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Menyimpan password..." : "Simpan password baru"}
      </button>
    </form>
  );
}
