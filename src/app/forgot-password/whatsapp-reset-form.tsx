"use client";

import { useActionState } from "react";
import {
  confirmWhatsAppResetAction,
  requestWhatsAppResetAction,
  type WhatsAppResetState,
} from "@/app/forgot-password/whatsapp-actions";

const initialState: WhatsAppResetState = {};

export function WhatsAppResetForm() {
  const [requestState, requestAction, requesting] = useActionState(requestWhatsAppResetAction, initialState);
  const [confirmState, confirmAction, confirming] = useActionState(confirmWhatsAppResetAction, initialState);

  return (
    <div>
      <form className="login-form" action={requestAction}>
        <label>
          Email akun
          <input name="email" type="email" maxLength={254} autoComplete="email" placeholder="nama@bisnis.com" required />
        </label>
        <button type="submit" disabled={requesting} aria-disabled={requesting}>
          {requesting ? "Mengirim kode..." : requestState.challengeId ? "Kirim kode baru" : "Kirim OTP WhatsApp"}
        </button>
      </form>
      {requestState.challengeId ? (
        <>
          <div className="settings-note" role="status">
            Jika akun punya nomor recovery yang sudah terverifikasi, kode berlaku 10 menit dan dikirim lewat WhatsApp.
          </div>
          <form className="login-form" action={confirmAction}>
            <input name="challengeId" type="hidden" value={requestState.challengeId} />
            <label>
              Kode OTP WhatsApp
              <input name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="one-time-code" required />
            </label>
            <label>
              Password baru
              <input name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
            </label>
            <label>
              Ulangi password baru
              <input name="confirmPassword" type="password" minLength={8} maxLength={128} autoComplete="new-password" required />
            </label>
            {confirmState.error ? <div className="settings-note" role="alert">{confirmState.error}</div> : null}
            <button type="submit" disabled={confirming} aria-disabled={confirming}>
              {confirming ? "Memulihkan akun..." : "Verifikasi OTP dan simpan password"}
            </button>
          </form>
        </>
      ) : null}
    </div>
  );
}
