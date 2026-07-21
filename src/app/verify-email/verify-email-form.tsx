"use client";

import { useActionState, useEffect } from "react";
import {
  verifyEmailAction,
  type VerifyEmailActionState,
} from "@/app/verify-email/actions";

const initialState: VerifyEmailActionState = {};

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, initialState);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <form className="login-form" action={action}>
      <input name="token" type="hidden" value={token} />
      <label>
        Password final
        <input
          aria-describedby="verify-password-hint"
          name="password"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Ulangi password final
        <input
          name="confirmPassword"
          type="password"
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          required
        />
      </label>
      <p className="auth-form-hint" id="verify-password-hint">
        Password ini menggantikan kredensial sementara dan menjadi satu-satunya password akunmu.
      </p>
      {state.error ? (
        <div className="settings-note" role="alert">
          <strong>Email belum diverifikasi</strong>
          <p>{state.error}</p>
        </div>
      ) : null}
      <button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Mengaktifkan akun..." : "Verifikasi dan simpan password"}
      </button>
    </form>
  );
}
