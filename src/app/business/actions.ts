"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  parseBusinessProfileFormData,
  updateBusinessProfile,
} from "@/server/business/profile";

export async function updateBusinessProfileAction(formData: FormData) {
  const session = await getRequiredSession();

  await updateBusinessProfile(session.userId, parseBusinessProfileFormData(formData));
  revalidateBusinessPaths();
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function revalidateBusinessPaths() {
  revalidatePath("/");
  revalidatePath("/business");
  revalidatePath("/setup");
  revalidatePath("/readiness");
}
