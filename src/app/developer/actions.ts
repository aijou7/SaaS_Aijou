"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserStatus } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import {
  activateWorkspacePlanAsAdmin,
  adjustWorkspaceTrialAsAdmin,
  getSafeDeveloperConsoleError,
  recordPlatformAdminAction,
  replayFailedJobAsAdmin,
  setUserStatusAsAdmin,
} from "@/server/admin-cockpit";
import { requirePlatformAdmin } from "@/server/feedback";
import { processTrialLifecycle } from "@/server/subscriptions/trial-lifecycle";

export async function activateWorkspacePlanAction(formData: FormData) {
  const session = await requireDeveloperSession();
  try {
    requireConfirmation(formData);
    await activateWorkspacePlanAsAdmin(session.userId, {
      businessId: String(formData.get("businessId") ?? ""),
      plan: String(formData.get("plan") ?? ""),
      billingCycle: String(formData.get("billingCycle") ?? ""),
      durationDays: Number(formData.get("durationDays") ?? 0),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirectWithError(getSafeDeveloperConsoleError(error));
  }
  finish("Paket workspace berhasil diaktifkan.");
}

export async function adjustWorkspaceTrialAction(formData: FormData) {
  const session = await requireDeveloperSession();
  try {
    requireConfirmation(formData);
    const operation = String(formData.get("operation") ?? "") === "END" ? "END" : "EXTEND";
    await adjustWorkspaceTrialAsAdmin(session.userId, {
      businessId: String(formData.get("businessId") ?? ""),
      operation,
      days: Number(formData.get("days") ?? 0),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    redirectWithError(getSafeDeveloperConsoleError(error));
  }
  finish("Status trial berhasil diperbarui.");
}

export async function setDeveloperUserStatusAction(formData: FormData) {
  const session = await requireDeveloperSession();
  const status = String(formData.get("status") ?? "");
  if (status !== UserStatus.ACTIVE && status !== UserStatus.SUSPENDED) {
    redirectWithError("Status akun tidak valid.");
  }
  try {
    requireConfirmation(formData);
    await setUserStatusAsAdmin(
      session.userId,
      String(formData.get("userId") ?? ""),
      status as UserStatus,
    );
  } catch (error) {
    redirectWithError(getSafeDeveloperConsoleError(error));
  }
  finish(status === UserStatus.SUSPENDED ? "Akun berhasil ditangguhkan." : "Akun berhasil diaktifkan.");
}

export async function replayDeveloperJobAction(formData: FormData) {
  const session = await requireDeveloperSession();
  try {
    await replayFailedJobAsAdmin(session.userId, String(formData.get("jobId") ?? ""));
  } catch (error) {
    redirectWithError(getSafeDeveloperConsoleError(error));
  }
  finish("Job dikembalikan ke antrean.");
}

export async function runTrialLifecycleAction(formData: FormData) {
  const session = await requireDeveloperSession();
  let message: string;
  try {
    requireConfirmation(formData);
    const result = await processTrialLifecycle();
    await recordPlatformAdminAction(session.userId, {
      action: "trial_lifecycle_run_manually",
      targetType: "platform_process",
      targetId: "public_trial_lifecycle",
      reason: "Lifecycle trial dijalankan manual dari developer console",
      after: result,
    });
    message = `Lifecycle selesai: ${result.expired} trial berakhir, ${result.emailsSent} email terkirim.`;
  } catch {
    redirectWithError("Trial lifecycle belum berhasil dijalankan.");
  }
  finish(message);
}

async function requireDeveloperSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  await requirePlatformAdmin(session.userId);
  return session;
}

function requireConfirmation(formData: FormData) {
  if (formData.get("confirmed") !== "yes") {
    throw new Error("Konfirmasi tindakan diperlukan.");
  }
}

function finish(message: string): never {
  revalidatePath("/developer");
  revalidatePath("/subscription");
  redirect(`/developer?saved=${encodeURIComponent(message)}`);
}

function redirectWithError(message: string): never {
  redirect(`/developer?error=${encodeURIComponent(message.slice(0, 240))}`);
}
