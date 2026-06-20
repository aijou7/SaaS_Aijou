import {
  ContactType,
  ConversationStatus,
  ConversationType,
  MessageType,
  ProcessingStatus,
  SenderType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { ExtractedWhatsAppMessage, WhatsAppWebhookPayload } from "@/server/whatsapp/payload";
import { findWhatsAppSettingsByIdentifier } from "@/server/whatsapp/settings";

export async function findBusinessForWhatsAppMessage(message: ExtractedWhatsAppMessage) {
  if (message.businessIdentifiers.length === 0) {
    return null;
  }

  const settings = await findWhatsAppSettingsByIdentifier(message.businessIdentifiers);

  if (settings) {
    return prisma.business.findUnique({
      where: { id: settings.businessId },
    });
  }

  return prisma.business.findFirst({
    where: {
      whatsappNumber: {
        in: message.businessIdentifiers,
      },
    },
  });
}

export async function storeIncomingWhatsAppMessage(params: {
  businessId: string;
  message: ExtractedWhatsAppMessage;
  payload: WhatsAppWebhookPayload;
  intent: string;
}) {
  const existingMessage = await prisma.whatsAppMessage.findUnique({
    where: {
      providerMessageId: params.message.id ?? "",
    },
    select: {
      id: true,
      conversationId: true,
      mediaFileId: true,
    },
  });

  if (existingMessage) {
    return {
      duplicate: true,
      businessId: params.businessId,
      messageId: existingMessage.id,
      conversationId: existingMessage.conversationId,
      mediaFileId: existingMessage.mediaFileId,
    };
  }

  const contact = await prisma.contact.upsert({
    where: {
      businessId_phoneNumber: {
        businessId: params.businessId,
        phoneNumber: params.message.from ?? "unknown",
      },
    },
    update: {
      contactType: ContactType.OWNER,
    },
    create: {
      businessId: params.businessId,
      phoneNumber: params.message.from ?? "unknown",
      contactType: ContactType.OWNER,
    },
  });

  const conversation = await prisma.whatsAppConversation.upsert({
    where: {
      id: `${params.businessId}:${contact.id}`,
    },
    update: {
      status:
        params.intent === "expense_create"
          ? ConversationStatus.PENDING_CONFIRMATION
          : ConversationStatus.OPEN,
      lastMessageAt: new Date(),
    },
    create: {
      id: `${params.businessId}:${contact.id}`,
      businessId: params.businessId,
      contactId: contact.id,
      conversationType: ConversationType.PERSONAL_FINANCE,
      status:
        params.intent === "expense_create"
          ? ConversationStatus.PENDING_CONFIRMATION
          : ConversationStatus.OPEN,
      lastMessageAt: new Date(),
    },
  });

  const mediaFile =
    params.message.type === "image" && params.message.image?.id
      ? await prisma.mediaFile.create({
          data: {
            businessId: params.businessId,
            providerMediaId: params.message.image.id,
            fileType: "receipt_image",
            mimeType: params.message.image.mime_type,
          },
        })
      : null;

  const storedMessage = await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      providerMessageId: params.message.id ?? crypto.randomUUID(),
      senderType: SenderType.USER,
      messageType: params.message.type === "image" ? MessageType.IMAGE : MessageType.TEXT,
      messageBody: params.message.text?.body,
      mediaFileId: mediaFile?.id,
      rawPayload: params.payload,
      intent: params.intent,
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });

  return {
    duplicate: false,
    businessId: params.businessId,
    messageId: storedMessage.id,
    conversationId: conversation.id,
    mediaFileId: mediaFile?.id ?? null,
  };
}
