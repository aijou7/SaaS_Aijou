"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { KnowledgeReviewStatus, KnowledgeSourceType } from "@/generated/prisma-beta/client";
import { knowledgeImportMaxBytes } from "@/lib/knowledge-limits";
import { getSession } from "@/lib/session";
import {
  createKnowledgeTemplate,
  createKnowledgeBaseEntry,
  deleteKnowledgeBaseEntry,
  generateStarterKnowledge,
  parseKnowledgeBaseFormData,
  reviewKnowledgeBaseEntry,
  updateKnowledgeBaseEntry,
} from "@/server/knowledge/knowledge-base";
import { extractKnowledgeFile } from "@/server/knowledge/file-extraction";
import { syncBusinessWebsiteKnowledge } from "@/server/knowledge/website-sync";

export async function createKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  await createKnowledgeBaseEntry(session.userId, parseKnowledgeBaseFormData(formData));
  revalidateKnowledgePaths();
  redirect("/knowledge?created=1");
}

export async function importTextKnowledgeAction(formData: FormData) {
  const session = await getRequiredSession();
  const file = formData.get("file");
  const pastedText = String(formData.get("pastedText") ?? "").trim();
  const titleInput = String(formData.get("title") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim() || "imported";
  const hasFile = file instanceof File && file.size > 0;

  if (hasFile && file.size > knowledgeImportMaxBytes) {
    throw new Error(
      `File terlalu besar. Maksimal ${Math.round(knowledgeImportMaxBytes / 1024 / 1024)} MB per import.`,
    );
  }
  const extracted = hasFile ? await extractKnowledgeFile(file) : null;
  const content = [pastedText, extracted?.content]
    .filter(Boolean)
    .join("\n\n--- isi file ---\n\n");

  if (!content) {
    throw new Error("Upload file atau paste informasi dulu.");
  }

  await createKnowledgeBaseEntry(session.userId, {
    title: titleInput || (hasFile ? file.name.replace(/\.[^.]+$/, "") : "Import percakapan lama"),
    category,
    content,
    isActive: false,
    sourceType: hasFile ? KnowledgeSourceType.FILE : KnowledgeSourceType.CONVERSATION,
    reviewStatus: KnowledgeReviewStatus.DRAFT,
    sourceName: hasFile ? file.name : "Teks yang ditempel owner",
    extractedMeta: extracted?.metadata,
  });
  revalidateKnowledgePaths();
  redirect("/knowledge?imported=draft");
}

export async function updateKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  const entryId = String(formData.get("entryId") ?? "");
  await updateKnowledgeBaseEntry(session.userId, entryId, parseKnowledgeBaseFormData(formData));
  revalidateKnowledgePaths();
  redirect("/knowledge?saved=1");
}

export async function deleteKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  const entryId = String(formData.get("entryId") ?? "");
  await deleteKnowledgeBaseEntry(session.userId, entryId);
  revalidateKnowledgePaths();
  redirect("/knowledge?deleted=1");
}

export async function createKnowledgeTemplateAction(formData: FormData) {
  const session = await getRequiredSession();
  const templateKey = String(formData.get("templateKey") ?? "");

  await createKnowledgeTemplate(session.userId, templateKey);
  revalidateKnowledgePaths();
  redirect("/knowledge?created=1");
}

export async function generateStarterKnowledgeAction() {
  const session = await getRequiredSession();

  await generateStarterKnowledge(session.userId);
  revalidateKnowledgePaths();
  redirect("/knowledge?generated=draft");
}

export async function reviewKnowledgeBaseAction(formData: FormData) {
  const session = await getRequiredSession();
  const entryId = String(formData.get("entryId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (decision !== "approve" && decision !== "reject") {
    throw new Error("Keputusan review tidak valid.");
  }
  await reviewKnowledgeBaseEntry(session.userId, entryId, decision);
  revalidateKnowledgePaths();
  redirect(`/knowledge?reviewed=${decision === "approve" ? "approved" : "rejected"}`);
}

export async function syncWebsiteKnowledgeAction() {
  const session = await getRequiredSession();
  const result = await syncBusinessWebsiteKnowledge(session.userId);
  revalidateKnowledgePaths();
  redirect(`/knowledge?websiteSync=success&prices=${result.priceCount}`);
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
