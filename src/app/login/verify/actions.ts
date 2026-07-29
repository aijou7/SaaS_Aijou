"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import { getSafeInternalRedirectPath } from "@/lib/safe-navigation";
import {
  AccountLifecycleError,
  resendLoginOtp,
  verifyLoginOtp,
} from "@/server/auth/account-lifecycle";
import { completeLogin } from "@/server/auth/login-completion";

export type LoginOtpActionState = { error?: string };

export async function verifyLoginOtpAction(
  _previousState: LoginOtpActionState,
  formData: FormData,
): Promise<LoginOtpActionState> {
  const challengeId = String(formData.get("challenge") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  const nextPath = getSafeInternalRedirectPath(String(formData.get("next") ?? ""));
  if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
    return { error: "Masukkan kode OTP 6 digit yang valid." };
  }

  try {
    const requestHeaders = await headers();
    const clientIp = getClientIpFromHeaders(requestHeaders);
    const user = await verifyLoginOtp(challengeId, code, clientIp);
    const completion = await completeLogin(
      user,
      clientIp,
      formData.get("trustDevice") === "on",
    );
    if (!completion.completed) {
      return { error: "Akun berubah saat login. Silakan mulai ulang." };
    }
    const destination = completion.deletionCancelled
      ? "/dashboard?deletionCancelled=1"
      : nextPath ?? "/dashboard";
    redirect(destination);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String(error.digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return {
      error:
        error instanceof AccountLifecycleError
          ? error.message
          : "Kode belum berhasil diverifikasi. Coba lagi sebentar.",
    };
  }
}

export async function resendLoginOtpAction(formData: FormData) {
  const challengeId = String(formData.get("challenge") ?? "").trim();
  const nextPath = getSafeInternalRedirectPath(String(formData.get("next") ?? ""));
  if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId)) {
    redirect("/login?error=otp_expired");
  }

  try {
    const requestHeaders = await headers();
    const delivery = await resendLoginOtp(
      challengeId,
      getClientIpFromHeaders(requestHeaders),
    );
    if (!delivery.sent || !delivery.challengeId) {
      redirect("/login?error=otp_delivery_failed");
    }
    const target = new URL("/login/verify", "https://aijoutek.pro");
    target.searchParams.set("challenge", delivery.challengeId);
    target.searchParams.set("resent", "1");
    if (nextPath) target.searchParams.set("next", nextPath);
    redirect(`${target.pathname}${target.search}`);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String(error.digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    redirect(
      error instanceof AccountLifecycleError && error.code === "RATE_LIMITED"
        ? "/login?error=otp_rate_limited"
        : "/login?error=otp_expired",
    );
  }
}
