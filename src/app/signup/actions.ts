"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import { createSessionCookie } from "@/lib/session";
import {
  acceptBetaInvite,
  getSafeBetaInviteError,
} from "@/server/auth/beta-invites";
import {
  createPublicBetaAccount,
  getSafePublicSignupError,
} from "@/server/auth/public-signup";

export type SignupActionState = { error?: string };

export async function signupPublicBetaAction(
  _state: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  // Keep this field visually hidden (not type=hidden) in the public form. Real
  // users leave it blank; simple autofill bots usually populate it.
  if (String(formData.get("companyWebsite") ?? "").trim()) {
    return { error: "Pendaftaran belum berhasil. Coba lagi beberapa saat." };
  }

  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmPassword") ?? "")) {
    return { error: "Konfirmasi password tidak sama." };
  }

  let user: Awaited<ReturnType<typeof createPublicBetaAccount>>;
  try {
    const requestHeaders = await headers();
    user = await createPublicBetaAccount(
      {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        phoneNumber: String(formData.get("phoneNumber") ?? ""),
        businessName: String(formData.get("businessName") ?? ""),
        password,
      },
      { clientIp: getClientIpFromHeaders(requestHeaders) },
    );
  } catch (error) {
    return { error: getSafePublicSignupError(error) };
  }

  await createSessionCookie({
    userId: user.userId,
    passwordHash: user.passwordHash,
  });
  redirect("/setup?welcome=1");
}

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
