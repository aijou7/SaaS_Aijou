"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { FeedbackStatus, UserStatus } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { replayFailedJobAsAdmin, setUserStatusAsAdmin } from "@/server/admin-cockpit";
import { updateFeedbackAsAdmin } from "@/server/feedback";

export async function setUserStatusAction(formData: FormData) {
  const session = await requireSession();
  const status = String(formData.get("status") ?? "ACTIVE");
  if (!Object.values(UserStatus).includes(status as UserStatus)) throw new Error("Status tidak valid.");
  await setUserStatusAsAdmin(session.userId, String(formData.get("userId") ?? ""), status as UserStatus);
  revalidatePath("/admin");
}

export async function updateFeedbackAction(formData: FormData) {
  const session = await requireSession();
  const status = String(formData.get("status") ?? "IN_REVIEW");
  if (!Object.values(FeedbackStatus).includes(status as FeedbackStatus)) throw new Error("Status tidak valid.");
  await updateFeedbackAsAdmin(session.userId, String(formData.get("feedbackId") ?? ""), {
    status,
    response: String(formData.get("response") ?? ""),
  });
  revalidatePath("/admin");
}

export async function replayFailedJobAction(formData: FormData) {
  const session = await requireSession();
  await replayFailedJobAsAdmin(session.userId, String(formData.get("jobId") ?? ""));
  revalidatePath("/admin");
}

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

