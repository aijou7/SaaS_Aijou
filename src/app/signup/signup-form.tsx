"use client";

import { useActionState, useEffect } from "react";
import {
  signupWithInviteAction,
  type SignupActionState,
} from "@/app/signup/actions";

export function SignupForm({
  token,
  email,
  businessName,
}: {
  token: string;
  email?: string | null;
  businessName?: string | null;
}) {
  const [state, action, pending] = useActionState<SignupActionState, FormData>(
    signupWithInviteAction,
    {},
  );

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <form className="login-form" action={action}>
      <input name="token" type="hidden" value={token} />
      <label>
        Nama lengkap
        <input name="name" type="text" maxLength={100} autoComplete="name" required />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          maxLength={254}
          autoComplete="email"
          defaultValue={email ?? ""}
          readOnly={Boolean(email)}
          required
        />
      </label>
      <label>
        Nomor WhatsApp owner
        <input name="phoneNumber" type="tel" maxLength={24} placeholder="62812..." required />
      </label>
      <label>
        Nama bisnis
        <input name="businessName" type="text" maxLength={120} defaultValue={businessName ?? ""} required />
      </label>
      <label>
        Password
        <input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
      </label>
      <label>
        Ulangi password
        <input name="confirmPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" required />
      </label>
      {state.error ? <div className="settings-note" role="alert">{state.error}</div> : null}
      <button type="submit" disabled={pending}>{pending ? "Menyiapkan workspace..." : "Mulai private beta"}</button>
    </form>
  );
}
