"use client";

import { useActionState } from "react";
import {
  resendVerificationOtpAction,
  verifyEmailOtpAction,
  type VerifyEmailActionState,
} from "@/app/verify-email/actions";

const initialState: VerifyEmailActionState = {};

export function VerifyEmailOtpForm({
  challengeId,
  maskedEmail,
}: {
  challengeId: string;
  maskedEmail: string;
}) {
  const [state, action, pending] = useActionState(
    verifyEmailOtpAction,
    initialState,
  );

  return (
    <>
      <form className="login-form" action={action}>
        <input name="challenge" type="hidden" value={challengeId} />
        <label>
          Kode OTP
          <input
            className="auth-otp-input"
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            required
          />
        </label>
        <p className="auth-form-hint">
          Kode dikirim ke {maskedEmail} dan berlaku selama 10 menit.
        </p>
        {state.error ? (
          <div className="settings-note" role="alert">
            <strong>Kode belum diterima</strong>
            <p>{state.error}</p>
          </div>
        ) : null}
        <button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? "Memeriksa kode..." : "Verifikasi dan masuk"}
        </button>
      </form>

      <form className="auth-resend-form" action={resendVerificationOtpAction}>
        <input name="challenge" type="hidden" value={challengeId} />
        <span>Belum menerima kode?</span>
        <button type="submit">Kirim ulang OTP</button>
      </form>
    </>
  );
}
