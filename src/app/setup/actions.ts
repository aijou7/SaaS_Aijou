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

export type CompleteOnboardingResult = {
  ok: boolean;
  message: string;
};

export async function completeOnboardingUiAction(): Promise<CompleteOnboardingResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sesi berakhir. Silakan masuk kembali." };

  try {
    await completeOnboarding(session.userId);
  } catch (error) {
    if (error instanceof OnboardingReadinessError) {
      return {
        ok: false,
        message: `Masih perlu diselesaikan: ${error.missingChecks.join(", ")}.`,
      };
    }
    return { ok: false, message: "Onboarding belum dapat diselesaikan. Coba lagi." };
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/setup");
  revalidatePath("/readiness");
  return { ok: true, message: "Workspace siap digunakan." };
}
