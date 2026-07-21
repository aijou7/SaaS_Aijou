"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  completeOnboarding,
  OnboardingReadinessError,
} from "@/server/business/profile";

export async function completeOnboardingAction() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    await completeOnboarding(session.userId);
  } catch (error) {
    if (error instanceof OnboardingReadinessError) {
      redirect("/setup?error=not_ready");
    }
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/setup");
  revalidatePath("/readiness");
  redirect("/dashboard?onboarding=complete");
}
