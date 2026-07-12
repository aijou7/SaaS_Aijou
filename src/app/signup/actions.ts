"use server";

import { redirect } from "next/navigation";
import { createSessionCookie } from "@/lib/session";
import {
  acceptBetaInvite,
  getSafeBetaInviteError,
} from "@/server/auth/beta-invites";

export type SignupActionState = { error?: string };

export async function signupWithInviteAction(
  _state: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmPassword") ?? "")) {
    return { error: "Konfirmasi password tidak sama." };
  }

  let user: Awaited<ReturnType<typeof acceptBetaInvite>>;
  try {
    user = await acceptBetaInvite({
      token: String(formData.get("token") ?? ""),
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      phoneNumber: String(formData.get("phoneNumber") ?? ""),
      businessName: String(formData.get("businessName") ?? ""),
      password,
    });
  } catch (error) {
    return {
      error: getSafeBetaInviteError(
        error,
        "Pendaftaran beta sementara gagal. Coba lagi beberapa saat.",
      ),
    };
  }

  await createSessionCookie({ userId: user.userId, passwordHash: user.passwordHash });
  redirect("/setup?welcome=1");
}
