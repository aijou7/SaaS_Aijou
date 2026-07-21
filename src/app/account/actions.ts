"use server";

import { redirect } from "next/navigation";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getSession } from "@/lib/session";
import {
  AccountLifecycleError,
  cancelAccountDeletion,
  requestAccountDeletion,
} from "@/server/auth/account-lifecycle";

export async function updateAccountProfileAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  const name = String(formData.get("name") ?? "").trim().slice(0, 100);
  const phoneNumber = normalizeOwnerPhone(String(formData.get("phoneNumber") ?? ""));
  if (!name) redirect("/account?error=name_required");
  if (!phoneNumber) redirect("/account?error=phone_invalid");

  await prisma.user.update({
    where: { id: session.userId },
    data: { name, phoneNumber },
  });
  redirect("/account?saved=1");
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
  const update = await prisma.user.updateMany({
    where: {
      id: user.id,
      passwordHash: user.passwordHash,
    },
    data: { passwordHash },
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

function normalizeOwnerPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  return /^\d{8,18}$/.test(digits) ? digits : null;
}
