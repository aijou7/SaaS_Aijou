"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getSession } from "@/lib/session";
import {
  AccountLifecycleError,
  cancelAccountDeletion,
  requestAccountDeletion,
  requestPhoneVerification,
  verifyPhoneVerification,
} from "@/server/auth/account-lifecycle";
import {
  confirmOwnerEmailChange,
  getSafeOwnerEmailChangeError,
  requestOwnerEmailChange,
} from "@/server/auth/owner-email-change";
import { normalizeWhatsAppPhone } from "@/server/whatsapp/phone";
import { submitRecoveryTemplate } from "@/server/auth/whatsapp-recovery-template";

export async function updateAccountProfileAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const phoneNumber = normalizeOwnerPhone(String(formData.get("phoneNumber") ?? ""));
  if (!name) redirect("/account?error=name_required");
  if (!phoneNumber) redirect("/account?error=phone_invalid");

  const current = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { phoneNumber: true, passwordHash: true },
  });
  if (!current) redirect("/login");
  const changedPhone = current.phoneNumber !== phoneNumber;
  if (changedPhone && !await verifyPassword(String(formData.get("currentPassword") ?? ""), current.passwordHash)) {
    redirect("/account?profileError=password_required");
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: session.userId, phoneNumber: current.phoneNumber, passwordHash: current.passwordHash },
      data: {
        name, phoneNumber,
        ...(changedPhone ? { recoveryPhoneVerifiedAt: null } : {}),
      },
    });
    if (updated.count !== 1) throw new Error("Account profile changed during update.");
    if (changedPhone) {
      await tx.authToken.updateMany({
        where: { userId: session.userId, purpose: { in: ["PHONE_VERIFICATION", "WHATSAPP_PASSWORD_RESET"] }, usedAt: null },
        data: { usedAt: new Date() },
      });
    }
  });
  redirect("/account?saved=1");
}

export async function submitRecoveryTemplateAction() {
  const session = await getSession();
  if (!session?.business || session.role !== "OWNER") redirect("/login");
  try {
    await submitRecoveryTemplate(session.business.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Template belum berhasil diajukan.";
    redirect(`/account?recoveryError=${encodeURIComponent(message)}`);
  }
  redirect("/account?recoveryTemplate=submitted");
}

export type PhoneRecoveryState = { challengeId?: string; error?: string; verified?: boolean };

export async function requestPhoneVerificationAction(
  _previous: PhoneRecoveryState,
  _formData: FormData,
): Promise<PhoneRecoveryState> {
  const session = await getSession();
  if (!session?.business || session.role !== "OWNER") return { error: "Masuk sebagai owner untuk melanjutkan." };
  try {
    const requestHeaders = await headers();
    return await requestPhoneVerification(session.userId, session.business.id, getClientIpFromHeaders(requestHeaders));
  } catch (error) {
    return { error: error instanceof AccountLifecycleError ? error.message : "Kode belum bisa dikirim. Coba lagi nanti." };
  }
}

export async function verifyPhoneVerificationAction(
  _previous: PhoneRecoveryState,
  formData: FormData,
): Promise<PhoneRecoveryState> {
  const session = await getSession();
  if (!session?.business || session.role !== "OWNER") return { error: "Masuk sebagai owner untuk melanjutkan." };
  const challengeId = String(formData.get("challengeId") ?? "");
  if (!/^[A-Za-z0-9_-]{32}$/.test(challengeId)) return { error: "Minta kode baru untuk melanjutkan." };
  try {
    const requestHeaders = await headers();
    await verifyPhoneVerification(session.userId, challengeId, String(formData.get("code") ?? "").trim(), getClientIpFromHeaders(requestHeaders));
    return { verified: true };
  } catch (error) {
    return { challengeId, error: error instanceof AccountLifecycleError ? error.message : "Kode belum bisa diverifikasi." };
  }
}

export async function changePasswordAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword !== confirmPassword) {
    redirect("/account?error=password_mismatch");
  }

  const passwordError = validatePasswordStrength(newPassword, session.email);
  if (passwordError) {
    redirect(`/account?error=${encodeURIComponent(passwordError)}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, passwordHash: true },
  });

  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    redirect("/account?error=current_password_invalid");
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    redirect("/account?error=password_unchanged");
  }

  const passwordHash = await hashPassword(newPassword);
  const update = await prisma.$transaction(async (tx) => {
    const changed = await tx.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash },
    });
    if (changed.count === 1) {
      await tx.authToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    return changed;
  });

  if (update.count !== 1) {
    redirect("/account?error=password_update_conflict");
  }

  await clearSessionCookie();
  redirect("/login?passwordChanged=1");
}

export async function requestAccountDeletionAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const password = String(formData.get("password") ?? "");
  try {
    await requestAccountDeletion(session.userId, password);
  } catch (error) {
    const code = error instanceof AccountLifecycleError ? error.code.toLowerCase() : "failed";
    redirect(`/account?deleteError=${encodeURIComponent(code)}`);
  }

  await clearSessionCookie();
  redirect("/login?deletionScheduled=1");
}

export async function cancelAccountDeletionAction() {
  const session = await getSession();
  if (!session) redirect("/login");

  await cancelAccountDeletion(session.userId);
  redirect("/account?deletionCancelled=1");
}

export async function requestOwnerEmailChangeAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  let errorMessage = "";
  try {
    await requestOwnerEmailChange(session.userId, {
      newEmail: String(formData.get("newEmail") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    errorMessage = getSafeOwnerEmailChangeError(error);
  }

  if (errorMessage) redirect(`/account?emailError=${encodeURIComponent(errorMessage)}`);
  redirect("/account?emailChange=requested");
}

export async function confirmOwnerEmailChangeAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  let errorMessage = "";
  try {
    await confirmOwnerEmailChange(session.userId, {
      requestId: String(formData.get("requestId") ?? ""),
      currentCode: String(formData.get("currentCode") ?? ""),
      newCode: String(formData.get("newCode") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
  } catch (error) {
    errorMessage = getSafeOwnerEmailChangeError(error);
  }

  if (errorMessage) redirect(`/account?emailError=${encodeURIComponent(errorMessage)}`);
  await clearSessionCookie();
  redirect("/login?emailChanged=1");
}

function normalizeOwnerPhone(value: string) {
  const digits = normalizeWhatsAppPhone(value);
  return /^\d{8,18}$/.test(digits) ? digits : null;
}
