"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  assignConversation,
  resolveConversation,
  sendOwnerConversationReply,
  sendOwnerWhatsAppTemplate,
  startOwnerWhatsAppTemplateConversation,
  setConversationTakeover,
  updateConversationOwnerNotes,
} from "@/server/conversations/conversations";
import { createConversationKnowledgeDraft } from "@/server/knowledge/knowledge-base";

export type ConversationMode = "takeover" | "ai" | "resolved";

export type ConversationModeResult = {
  ok: boolean;
  message: string;
};

export async function updateConversationModeUiAction(
  conversationId: string,
  mode: ConversationMode,
): Promise<ConversationModeResult> {
  const session = await getRequiredSession();

  try {
    if (!conversationId.trim()) throw new Error("Percakapan tidak valid.");
    if (mode === "resolved") {
      await resolveConversation(session.userId, conversationId);
    } else {
      await setConversationTakeover(session.userId, conversationId, mode === "takeover");
    }
    return {
      ok: true,
      message:
        mode === "takeover"
          ? "Human takeover aktif."
          : mode === "ai"
            ? "AI aktif kembali."
            : "Percakapan ditandai selesai.",
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Status percakapan gagal diubah.",
    };
  }
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
    const sent = await sendOwnerConversationReply(session.userId, conversationId, message);
    const saveAsKnowledge = formData.get("saveAsKnowledge") === "on";
    if (saveAsKnowledge) {
      await createConversationKnowledgeDraft({
        userId: session.userId,
        conversationId,
        messageId: sent.messageId,
        content: message,
      });
      revalidatePath("/knowledge");
    }
    return {
      ok: true,
      message: saveAsKnowledge
        ? "Balasan terkirim dan draft knowledge dibuat."
        : "Balasan terkirim.",
      nonce: Date.now(),
    };
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
  const { templateName, languageCode } = parseApprovedTemplateKey(formData);
  const parameters = String(formData.get("bodyParameters") ?? "")
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);

  await sendOwnerWhatsAppTemplate(session.userId, conversationId, {
    templateName,
    languageCode,
    bodyParameters: parameters,
  });
  revalidateConversationPages(conversationId);
}

export async function startNewWhatsAppChatAction(formData: FormData) {
  const session = await getRequiredSession();
  const { templateName, languageCode } = parseApprovedTemplateKey(formData);
  const result = await startOwnerWhatsAppTemplateConversation(session.userId, {
    phoneNumber: String(formData.get("phoneNumber") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    templateName,
    languageCode,
    bodyParameters: String(formData.get("bodyParameters") ?? "")
      .split("\n")
      .map((value) => value.trim())
      .filter(Boolean),
  });

  revalidateConversationPages(result.conversationId);
  redirect(`/conversations?conversationId=${encodeURIComponent(result.conversationId)}`);
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

function parseApprovedTemplateKey(formData: FormData) {
  const templateKey = String(formData.get("templateKey") ?? "").trim();
  const separatorIndex = templateKey.indexOf("::");
  const templateName = separatorIndex >= 0 ? templateKey.slice(0, separatorIndex) : "";
  const languageCode = separatorIndex >= 0 ? templateKey.slice(separatorIndex + 2) : "";

  if (!templateName || !languageCode) {
    throw new Error("Pilih template WhatsApp yang sudah disetujui Meta.");
  }

  return { templateName, languageCode };
}
