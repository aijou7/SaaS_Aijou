"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createKnowledgeTemplate,
  createKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
  generateStarterKnowledge,
  parseKnowledgeBaseFormData,
  updateKnowledgeBaseEntry,
} from "@/server/knowledge/knowledge-base";

export async function createKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  await createKnowledgeBaseEntry(session.userId, parseKnowledgeBaseFormData(formData));
  revalidateKnowledgePaths();
}

export async function importTextKnowledgeAction(formData: FormData) {
  const session = await getRequiredSession();
  const file = formData.get("file");
  const pastedText = String(formData.get("pastedText") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || "Imported WhatsApp conversation";
  const category = String(formData.get("category") ?? "").trim() || "imported-chat";
  const fileText = file instanceof File ? (await file.text()).trim() : "";
  const content = [pastedText, fileText].filter(Boolean).join("\n\n--- imported file ---\n\n");

  if (!content) {
    throw new Error("Upload .txt atau paste percakapan dulu.");
  }

  await createKnowledgeBaseEntry(session.userId, {
    title,
    category,
    content,
    isActive: true,
  });
  revalidateKnowledgePaths();
}

export async function updateKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  const entryId = String(formData.get("entryId") ?? "");
  await updateKnowledgeBaseEntry(session.userId, entryId, parseKnowledgeBaseFormData(formData));
  revalidateKnowledgePaths();
}

export async function deleteKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  const entryId = String(formData.get("entryId") ?? "");
  await deleteKnowledgeBaseEntry(session.userId, entryId);
  revalidateKnowledgePaths();
}

export async function createKnowledgeTemplateAction(formData: FormData) {
  const session = await getRequiredSession();
  const templateKey = String(formData.get("templateKey") ?? "");

  await createKnowledgeTemplate(session.userId, templateKey);
  revalidateKnowledgePaths();
}

export async function generateStarterKnowledgeAction() {
  const session = await getRequiredSession();

  await generateStarterKnowledge(session.userId);
  revalidateKnowledgePaths();
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function revalidateKnowledgePaths() {
  revalidatePath("/");
  revalidatePath("/knowledge");
  revalidatePath("/training");
  revalidatePath("/simulator");
}
