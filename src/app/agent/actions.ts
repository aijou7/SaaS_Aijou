"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { parseAgentSettingsFormData, updateAgentSettings } from "@/server/agent/settings";

export async function updateAgentSettingsAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  await updateAgentSettings(session.userId, parseAgentSettingsFormData(formData));
  revalidatePath("/");
  revalidatePath("/agent");
  revalidatePath("/simulator");
  revalidatePath("/conversations");
}
