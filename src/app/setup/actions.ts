"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { KnowledgeReviewStatus, KnowledgeSourceType } from "@/generated/prisma-beta/client";
import { parseAgentSettingsFormData, updateAgentSettings } from "@/server/agent/settings";
import {
  completeOnboarding,
  OnboardingReadinessError,
  parseBusinessProfileFormData,
  updateBusinessProfile,
} from "@/server/business/profile";
import { createKnowledgeBaseEntry } from "@/server/knowledge/knowledge-base";

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

export async function saveOnboardingBusinessUiAction(
  formData: FormData,
): Promise<CompleteOnboardingResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sesi berakhir. Silakan masuk kembali." };
  try {
    await updateBusinessProfile(session.userId, parseBusinessProfileFormData(formData));
    revalidateSetupPaths();
    return { ok: true, message: "Profil bisnis tersimpan." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Profil gagal disimpan." };
  }
}

export async function saveOnboardingAgentUiAction(
  formData: FormData,
): Promise<CompleteOnboardingResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sesi berakhir. Silakan masuk kembali." };
  try {
    formData.delete("isActive");
    await updateAgentSettings(session.userId, parseAgentSettingsFormData(formData));
    revalidateSetupPaths();
    return { ok: true, message: "Karakter dan batasan Aijou tersimpan." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Pengaturan AI gagal disimpan." };
  }
}

export async function saveOnboardingKnowledgeUiAction(
  formData: FormData,
): Promise<CompleteOnboardingResult> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Sesi berakhir. Silakan masuk kembali." };
  try {
    await createKnowledgeBaseEntry(session.userId, {
      title: String(formData.get("title") ?? "Informasi bisnis awal"),
      category: String(formData.get("category") ?? "onboarding"),
      content: String(formData.get("content") ?? ""),
      isActive: true,
      sourceType: KnowledgeSourceType.ONBOARDING,
      reviewStatus: KnowledgeReviewStatus.APPROVED,
      priority: 90,
      sourceName: "Panduan setup",
    });
    revalidateSetupPaths();
    return { ok: true, message: "Knowledge awal aktif dan siap dipakai Aijou." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Knowledge gagal disimpan." };
  }
}

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

function revalidateSetupPaths() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/business");
  revalidatePath("/agent");
  revalidatePath("/knowledge");
  revalidatePath("/setup");
}
