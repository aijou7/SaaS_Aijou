"use server";

import { redirect } from "next/navigation";
import {
  AccountLifecycleError,
  resetPasswordWithToken,
} from "@/server/auth/account-lifecycle";

export type ResetPasswordActionState = {
  error?: string;
};

export async function resetPasswordAction(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const token = String(formData.get("token") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!isPlausibleToken(token)) {
    return { error: "Link reset tidak valid atau sudah kedaluwarsa." };
  }
  if (password !== confirmPassword) {
    return { error: "Konfirmasi password baru tidak sama." };
  }

  try {
    await resetPasswordWithToken(token, password);
  } catch (error) {
    if (error instanceof AccountLifecycleError) {
      return {
        error:
          error.code === "WEAK_PASSWORD"
            ? error.message
            : "Link reset tidak valid, sudah dipakai, atau sudah kedaluwarsa.",
      };
    }

    return { error: "Password belum berhasil diubah. Coba lagi sebentar." };
  }

  redirect("/login?passwordReset=1");
}

function isPlausibleToken(value: string) {
  return /^[A-Za-z0-9_-]{40,128}$/.test(value);
}
