"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import { createSessionCookie } from "@/lib/session";
import { isTransactionalEmailConfigured } from "@/server/email";
import {
  acceptBetaInvite,
  getSafeBetaInviteError,
} from "@/server/auth/beta-invites";
import {
  createPublicBetaAccount,
  discardUnverifiedPublicBetaAccount,
  getSafePublicSignupError,
} from "@/server/auth/public-signup";
import { sendVerificationEmailForUser } from "@/server/auth/account-lifecycle";

export type SignupActionState = { error?: string };

const verificationDeliveryError =
  "Pendaftaran sementara belum tersedia karena email verifikasi belum dapat dikirim. Coba lagi nanti.";

export async function signupPublicBetaAction(
  _state: SignupActionState,
  formData: FormData,
): Promise<SignupActionState> {
  // Keep this field visually hidden (not type=hidden) in the public form. Real
  // users leave it blank; simple autofill bots usually populate it.
  if (String(formData.get("companyWebsite") ?? "").trim()) {
    return { error: "Pendaftaran belum berhasil. Coba lagi beberapa saat." };
  }

  if (!isTransactionalEmailConfigured()) {
    return { error: verificationDeliveryError };
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
      },
      { clientIp: getClientIpFromHeaders(requestHeaders) },
    );
  } catch (error) {
    return { error: getSafePublicSignupError(error) };
  }

  try {
    const delivery = await sendVerificationEmailForUser(user.userId);
    if (!delivery.sent) {
      console.error("public_signup_verification_delivery_failed", {
        userId: user.userId,
        configured: delivery.configured,
        error: delivery.error,
      });
      await discardFailedPublicSignup(user.userId);
      return { error: verificationDeliveryError };
    }
  } catch (error) {
    console.error("public_signup_verification_failed", { userId: user.userId, error });
    await discardFailedPublicSignup(user.userId);
    return { error: verificationDeliveryError };
  }
  redirect("/verify-email?sent=1");
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

async function discardFailedPublicSignup(userId: string) {
  try {
    const deleted = await discardUnverifiedPublicBetaAccount(userId);
    if (deleted !== 1) {
      console.error("public_signup_cleanup_skipped", { userId, deleted });
    }
  } catch (error) {
    // Authentication remains fail-closed because unverified users cannot create
    // a session. Keep the cleanup failure visible to operators for remediation.
    console.error("public_signup_cleanup_failed", { userId, error });
  }
}
