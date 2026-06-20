"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  parseWhatsAppSettingsFormData,
  updateWhatsAppSettings,
} from "@/server/whatsapp/settings";

export async function updateWhatsAppSettingsAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  await updateWhatsAppSettings(session.userId, parseWhatsAppSettingsFormData(formData));
  revalidatePath("/whatsapp");
  revalidatePath("/readiness");
  revalidatePath("/setup");
}
