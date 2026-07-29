"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getSafeInternalRedirectPath } from "@/lib/safe-navigation";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/notifications/notifications";

export async function openNotificationAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");

  await markNotificationRead(
    session.userId,
    String(formData.get("notificationId") ?? ""),
  );
  const href =
    getSafeInternalRedirectPath(String(formData.get("href") ?? "")) ||
    "/notifications";
  revalidatePath("/notifications");
  redirect(href);
}

export async function markAllNotificationsReadAction() {
  const session = await getSession();
  if (!session) redirect("/login");
  await markAllNotificationsRead(session.userId);
  revalidatePath("/notifications");
}
