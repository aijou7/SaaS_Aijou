"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createQuickReply,
  deleteQuickReply,
  updateQuickReply,
} from "@/server/quick-replies/quick-replies";

export async function createQuickReplyAction(formData: FormData) {
  const session = await getRequiredSession();

  await createQuickReply(session.userId, formData);
  revalidateQuickReplyPages();
}

export async function updateQuickReplyAction(formData: FormData) {
  const session = await getRequiredSession();
  const quickReplyId = String(formData.get("quickReplyId") ?? "");

  await updateQuickReply(session.userId, quickReplyId, formData);
  revalidateQuickReplyPages();
}

export async function deleteQuickReplyAction(formData: FormData) {
  const session = await getRequiredSession();
  const quickReplyId = String(formData.get("quickReplyId") ?? "");

  await deleteQuickReply(session.userId, quickReplyId);
  revalidateQuickReplyPages();
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function revalidateQuickReplyPages() {
  revalidatePath("/quick-replies");
  revalidatePath("/conversations");
}
