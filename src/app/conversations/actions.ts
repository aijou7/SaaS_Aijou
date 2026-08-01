"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  assignConversation,
  resolveConversation,
  sendOwnerConversationReply,
  sendOwnerWhatsAppTemplate,
  setConversationTakeover,
  updateConversationOwnerNotes,
} from "@/server/conversations/conversations";

export async function takeoverConversationAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");

  await setConversationTakeover(session.userId, conversationId, true);
  revalidateConversationPages(conversationId);
}

export async function releaseConversationAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");

  await setConversationTakeover(session.userId, conversationId, false);
  revalidateConversationPages(conversationId);
}

export async function sendOwnerReplyAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");
  const message = String(formData.get("message") ?? "");

  await sendOwnerConversationReply(session.userId, conversationId, message);
  revalidateConversationPages(conversationId);
}

export type ConversationReplyState = {
  ok: boolean;
  message: string;
  nonce: number;
};

export async function sendOwnerReplyUiAction(
  _state: ConversationReplyState,
  formData: FormData,
): Promise<ConversationReplyState> {
  try {
    const session = await getRequiredSession();
    const conversationId = String(formData.get("conversationId") ?? "");
    const message = String(formData.get("message") ?? "");
    await sendOwnerConversationReply(session.userId, conversationId, message);
    revalidateConversationPages(conversationId);
    return { ok: true, message: "Balasan terkirim.", nonce: Date.now() };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Balasan gagal dikirim.",
      nonce: Date.now(),
    };
  }
}

export async function sendWhatsAppTemplateAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");
  const parameters = String(formData.get("bodyParameters") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  await sendOwnerWhatsAppTemplate(session.userId, conversationId, {
    templateName: String(formData.get("templateName") ?? ""),
    languageCode: String(formData.get("languageCode") ?? "id"),
    bodyParameters: parameters,
  });
  revalidateConversationPages(conversationId);
}

export async function resolveConversationAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");

  await resolveConversation(session.userId, conversationId);
  revalidateConversationPages(conversationId);
}

export async function updateConversationNotesAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");
  const ownerNotes = String(formData.get("ownerNotes") ?? "");

  await updateConversationOwnerNotes(session.userId, conversationId, ownerNotes);
  revalidateConversationPages(conversationId);
}

export async function assignConversationAction(formData: FormData) {
  const session = await getRequiredSession();
  const conversationId = String(formData.get("conversationId") ?? "");
  const assignee = String(formData.get("assigneeUserId") ?? "").trim();
  await assignConversation(session.userId, conversationId, assignee || null);
  revalidateConversationPages(conversationId);
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function revalidateConversationPages(conversationId: string) {
  revalidatePath("/");
  revalidatePath("/conversations");
  revalidatePath(`/conversations?conversationId=${conversationId}`);
}
