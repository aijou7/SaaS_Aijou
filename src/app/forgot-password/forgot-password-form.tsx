"use client";

import { useActionState } from "react";
import {
  requestPasswordResetAction,
  type ForgotPasswordActionState,
} from "@/app/forgot-password/actions";

const initialState: ForgotPasswordActionState = {};

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  if (state.submitted) {
    return (
      <div className="settings-note" role="status">
        <strong>Periksa inbox kamu</strong>
        <p>
          Jika email itu terdaftar, kami mengirim link reset yang berlaku 60 menit.
          Periksa juga folder spam.
        </p>
      </div>
    );
  }

  return (
    <form className="login-form" action={action}>
      <label>
        Email akun
        <input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          placeholder="nama@bisnis.com"
          spellCheck={false}
          required
        />
      </label>
      <button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Mengirim instruksi..." : "Kirim link reset"}
      </button>
    </form>
  );
}
