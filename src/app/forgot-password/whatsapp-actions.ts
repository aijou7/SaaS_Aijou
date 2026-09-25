"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import { AccountLifecycleError, requestWhatsAppPasswordReset, resetPasswordWithWhatsAppOtp } from "@/server/auth/account-lifecycle";

export type WhatsAppResetState = { challengeId?: string; error?: string };

export async function requestWhatsAppResetAction(
  _previous: WhatsAppResetState,
  formData: FormData,
): Promise<WhatsAppResetState> {
  const email = String(formData.get("email") ?? "").slice(0, 254);
  try {
    const requestHeaders = await headers();
    return await requestWhatsAppPasswordReset(email, getClientIpFromHeaders(requestHeaders));
  } catch {
    // A provider or account lookup failure must not disclose account existence.
    return { challengeId: crypto.randomUUID().replaceAll("-", "") };
  }
}

export async function confirmWhatsAppResetAction(
  _previous: WhatsAppResetState,
  formData: FormData,
): Promise<WhatsAppResetState> {
  const challengeId = String(formData.get("challengeId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
    return { error: "Kode salah atau sudah kedaluwarsa." };
  }
  if (password !== confirmPassword) return { error: "Konfirmasi password baru tidak sama." };

  try {
    const requestHeaders = await headers();
    await resetPasswordWithWhatsAppOtp(challengeId, code, password, getClientIpFromHeaders(requestHeaders));
  } catch (error) {
    return {
      error: error instanceof AccountLifecycleError && error.code === "WEAK_PASSWORD"
        ? error.message
        : "Kode salah, sudah dipakai, atau sudah kedaluwarsa.",
    };
  }
  redirect("/login?passwordReset=1");
}
