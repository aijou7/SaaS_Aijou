"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  AgentActivationError,
  parseAgentSettingsFormData,
  updateAgentSettings,
} from "@/server/agent/settings";

export async function updateAgentSettingsAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    await updateAgentSettings(session.userId, parseAgentSettingsFormData(formData));
  } catch (error) {
    if (error instanceof AgentActivationError) {
      redirect("/agent?error=not_ready");
    }
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/agent");
  revalidatePath("/setup");
  revalidatePath("/readiness");
  revalidatePath("/simulator");
  revalidatePath("/conversations");
  redirect("/agent?saved=1");
}
