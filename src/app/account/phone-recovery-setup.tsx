"use client";

import { useActionState } from "react";
import {
  requestPhoneVerificationAction,
  verifyPhoneVerificationAction,
  type PhoneRecoveryState,
} from "@/app/account/actions";

const initialState: PhoneRecoveryState = {};

export function PhoneRecoverySetup({ phoneNumber, verified }: { phoneNumber: string; verified: boolean }) {
  const [requestState, requestAction, requesting] = useActionState(requestPhoneVerificationAction, initialState);
  const [verifyState, verifyAction, verifying] = useActionState(verifyPhoneVerificationAction, initialState);

  if (verified || verifyState.verified) {
    return <div className="settings-note" role="status"><strong>Nomor recovery aktif</strong><p>OTP pemulihan akun akan dikirim ke {phoneNumber}.</p></div>;
  }

  return (
    <div className="form-grid">
      <p className="muted span-2">Verifikasi {phoneNumber} sebelum nomor ini dapat dipakai untuk memulihkan akun.</p>
      <form className="form-grid span-2" action={requestAction}>
        <button className="ghost-button span-2" type="submit" disabled={requesting}>
          {requesting ? "Mengirim kode..." : requestState.challengeId ? "Kirim kode baru" : "Kirim kode verifikasi WhatsApp"}
        </button>
      </form>
      {requestState.error ? <div className="settings-note span-2" role="alert">{requestState.error}</div> : null}
      {requestState.challengeId ? (
        <form className="form-grid span-2" action={verifyAction}>
          <input name="challengeId" type="hidden" value={requestState.challengeId} />
          <label className="span-2">
            Kode dari WhatsApp
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required />
          </label>
          {verifyState.error ? <div className="settings-note span-2" role="alert">{verifyState.error}</div> : null}
          <button className="primary-button span-2" type="submit" disabled={verifying}>
            {verifying ? "Memverifikasi..." : "Aktifkan nomor recovery"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
