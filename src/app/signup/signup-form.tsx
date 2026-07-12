"use client";

import { useActionState, useEffect } from "react";
import {
  signupPublicBetaAction,
  signupWithInviteAction,
  type SignupActionState,
} from "@/app/signup/actions";

type SignupFormProps = {
  mode: "public" | "invite";
  token?: string;
  email?: string | null;
  businessName?: string | null;
};

export function SignupForm({
  mode,
  token = "",
  email,
  businessName,
}: SignupFormProps) {
  const signupAction = mode === "invite" ? signupWithInviteAction : signupPublicBetaAction;
  const [state, action, pending] = useActionState<SignupActionState, FormData>(
    signupAction,
    {},
  );

  useEffect(() => {
    if (mode === "invite" && window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [mode]);

  return (
    <form className="login-form signup-form" action={action}>
      {mode === "invite" ? <input name="token" type="hidden" value={token} /> : null}

      {mode === "public" ? (
        <label className="signup-trap" aria-hidden="true">
          Company website
          <input
            name="companyWebsite"
            type="text"
            autoComplete="off"
            tabIndex={-1}
          />
        </label>
      ) : null}

      <div className="auth-field-row">
        <label>
          Nama lengkap
          <input
            name="name"
            type="text"
            maxLength={100}
            autoComplete="name"
            placeholder="Nama kamu"
            required
          />
        </label>
        <label>
          Nama bisnis
          <input
            name="businessName"
            type="text"
            maxLength={120}
            autoComplete="organization"
            defaultValue={businessName ?? ""}
            placeholder="Contoh: Aijou Studio"
            required
          />
        </label>
      </div>

      <label>
        Email owner
        <input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          defaultValue={email ?? ""}
          placeholder="nama@bisnis.com"
          readOnly={Boolean(email)}
          spellCheck={false}
          required
        />
      </label>

      <label>
        Nomor WhatsApp owner {mode === "public" ? <span>(opsional)</span> : null}
        <input
          name="phoneNumber"
          type="tel"
          inputMode="tel"
          maxLength={24}
          autoComplete="tel"
          placeholder="Contoh: 628123456789"
          required={mode === "invite"}
        />
      </label>

      <div className="auth-field-row">
        <label>
          Password
          <input
            aria-describedby="signup-password-hint"
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
      <p className="auth-form-hint" id="signup-password-hint">
        Minimal 12 karakter, gunakan huruf dan angka. Hindari nama atau emailmu.
      </p>

      {state.error ? (
        <div className="settings-note" role="alert">
          <strong>Workspace belum berhasil dibuat</strong>
          <p>{state.error}</p>
        </div>
      ) : null}

      <button type="submit" disabled={pending} aria-disabled={pending}>
        {pending
          ? "Menyiapkan workspace..."
          : mode === "invite"
            ? "Aktifkan workspace"
            : "Buat workspace beta"}
      </button>
    </form>
  );
}
