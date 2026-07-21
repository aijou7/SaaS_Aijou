"use server";

import { redirect } from "next/navigation";
import {
  AccountLifecycleError,
  verifyEmailWithToken,
} from "@/server/auth/account-lifecycle";

export type VerifyEmailActionState = {
  error?: string;
};

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
