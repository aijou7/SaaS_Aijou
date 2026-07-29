"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import {
  AccountLifecycleError,
  resendVerificationOtp,
  verifyEmailWithOtp,
  verifyEmailWithToken,
} from "@/server/auth/account-lifecycle";
import { completeLogin } from "@/server/auth/login-completion";

export type VerifyEmailActionState = {
  error?: string;
};

export async function verifyEmailOtpAction(
  _previousState: VerifyEmailActionState,
  formData: FormData,
): Promise<VerifyEmailActionState> {
  const challengeId = String(formData.get("challenge") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId) || !/^\d{6}$/.test(code)) {
    return { error: "Masukkan kode OTP 6 digit yang valid." };
  }

  try {
    const requestHeaders = await headers();
    const clientIp = getClientIpFromHeaders(requestHeaders);
    const user = await verifyEmailWithOtp(
      challengeId,
      code,
      clientIp,
    );
    const completion = await completeLogin(user, clientIp, true);
    if (!completion.completed) {
      return { error: "Akun berubah saat diverifikasi. Silakan masuk kembali." };
    }
  } catch (error) {
    return {
      error:
        error instanceof AccountLifecycleError
          ? error.message
          : "Email belum berhasil diverifikasi. Coba lagi sebentar.",
    };
  }

  redirect("/setup?welcome=1&emailVerified=1");
}

export async function resendVerificationOtpAction(formData: FormData) {
  const challengeId = String(formData.get("challenge") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId)) {
    redirect("/verify-email?error=invalid");
  }

  try {
    const requestHeaders = await headers();
    const delivery = await resendVerificationOtp(
      challengeId,
      getClientIpFromHeaders(requestHeaders),
    );
    if (!delivery.sent || !delivery.challengeId) {
      redirect("/verify-email?error=delivery");
    }
    redirect(
      `/verify-email?challenge=${encodeURIComponent(delivery.challengeId)}&resent=1`,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String(error.digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    const code =
      error instanceof AccountLifecycleError && error.code === "RATE_LIMITED"
        ? "rate"
        : "invalid";
    redirect(`/verify-email?error=${code}`);
  }
}

export async function verifyEmailAction(
  _previousState: VerifyEmailActionState,
  formData: FormData,
): Promise<VerifyEmailActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
    return { error: "Link verifikasi tidak valid atau sudah kedaluwarsa." };
  }
  if (password !== confirmPassword) {
    return { error: "Konfirmasi password baru tidak sama." };
  }

  try {
    await verifyEmailWithToken(token, password);
  } catch (error) {
    return {
      error:
        error instanceof AccountLifecycleError
          ? error.code === "WEAK_PASSWORD"
            ? error.message
            : "Link verifikasi tidak valid, sudah dipakai, atau sudah kedaluwarsa."
          : "Email belum berhasil diverifikasi. Coba lagi sebentar.",
    };
  }

  redirect("/verify-email?success=1");
}
