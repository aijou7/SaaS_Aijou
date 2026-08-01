"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { updateBusinessHours } from "@/server/operations/business-hours";

export async function updateBusinessHoursAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  await updateBusinessHours(session.userId, formData);
  revalidatePath("/hours");
  revalidatePath("/agent");
  redirect("/hours?saved=1");
}
