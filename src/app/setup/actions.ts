"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { completeOnboarding } from "@/server/business/profile";

export async function completeOnboardingAction() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  await completeOnboarding(session.userId);
  revalidatePath("/");
  revalidatePath("/setup");
  revalidatePath("/readiness");
  redirect("/");
}
