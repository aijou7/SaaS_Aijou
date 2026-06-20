"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  resolveConversation,
  sendOwnerConversationReply,
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
