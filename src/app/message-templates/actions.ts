"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createMessageTemplate,
  submitMessageTemplate,
  updateMessageTemplate,
} from "@/server/message-templates/message-templates";

export async function createMessageTemplateAction(formData: FormData) {
  const session = await getSession();

  if (!session) redirect("/login");

  await createMessageTemplate(session.userId, formData);
  revalidatePath("/message-templates");
  revalidatePath("/broadcasts");
  redirect("/message-templates?created=1");
}

export async function submitMessageTemplateAction(formData: FormData) {
  const session = await getSession();

  if (!session) redirect("/login");

  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) throw new Error("Template draft tidak ditemukan.");

  await submitMessageTemplate(session.userId, templateId);
  revalidatePath("/message-templates");
  revalidatePath("/broadcasts");
  redirect("/message-templates?submitted=1");
}

export async function updateMessageTemplateAction(formData: FormData) {
  const session = await getSession();

  if (!session) redirect("/login");

  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) throw new Error("Template draft tidak ditemukan.");

  await updateMessageTemplate(session.userId, templateId, formData);
  revalidatePath("/message-templates");
  revalidatePath("/broadcasts");
  redirect("/message-templates?updated=1");
}
