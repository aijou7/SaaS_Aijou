"use client";

import { useActionState } from "react";
import {
  resendLoginOtpAction,
  verifyLoginOtpAction,
  type LoginOtpActionState,
} from "@/app/login/verify/actions";

const initialState: LoginOtpActionState = {};

export function LoginOtpForm({
  challengeId,
  maskedEmail,
  nextPath,
}: {
  challengeId: string;
  maskedEmail: string;
  nextPath: string | null;
}) {
  const [state, action, pending] = useActionState(
    verifyLoginOtpAction,
    initialState,
  );

  return (
    <>
      <form className="login-form" action={action}>
        <input name="challenge" type="hidden" value={challengeId} />
        {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
        <label>
          Kode login
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
        <label className="auth-checkbox-row">
          <input name="trustDevice" type="checkbox" defaultChecked />
          <span>Percayai perangkat ini selama 30 hari</span>
        </label>
        {state.error ? (
          <div className="settings-note" role="alert">
            <strong>Login belum selesai</strong>
            <p>{state.error}</p>
          </div>
        ) : null}
        <button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? "Memeriksa kode..." : "Lanjut ke workspace"}
        </button>
      </form>

      <form className="auth-resend-form" action={resendLoginOtpAction}>
        <input name="challenge" type="hidden" value={challengeId} />
        {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
        <span>Belum menerima kode?</span>
        <button type="submit">Kirim ulang OTP</button>
      </form>
    </>
  );
}
