import {
  ContactType,
  ConversationStatus,
  ConversationType,
  MessageType,
  Prisma,
  ProcessingStatus,
  SenderType,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import type { ExtractedWhatsAppMessage } from "@/server/whatsapp/payload";
import { findWhatsAppSettingsByIdentifier } from "@/server/whatsapp/settings";

export type WhatsAppMessageRole = "OWNER_FINANCE" | "CUSTOMER_SERVICE";

const businessContextSelect = {
  id: true,
  userId: true,
  businessName: true,
  whatsappNumber: true,
  user: {
    select: {
      phoneNumber: true,
    },
  },
  whatsAppSettings: {
    select: {
      phoneNumberId: true,
      isActive: true,
    },
  },
} as const;

export async function findBusinessForWhatsAppMessage(message: ExtractedWhatsAppMessage) {
  if (message.businessIdentifiers.length === 0) {
    return null;
  }

  const settings = await findWhatsAppSettingsByIdentifier(message.businessIdentifiers);

  if (settings) {
    return prisma.business.findUnique({
      where: { id: settings.businessId },
      select: businessContextSelect,
    });
  }

  const fallbackMatches = await prisma.business.findMany({
    where: {
      whatsappNumber: {
        in: businessIdentifierVariants(message.businessIdentifiers),
      },
    },
    select: businessContextSelect,
    take: 2,
  });

  return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}

export async function findBusinessForQueuedWhatsApp(
  businessId: string,
  businessIdentifiers: string[],
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: businessContextSelect,
  });
  const phoneNumberId = business?.whatsAppSettings?.phoneNumberId;

  if (
    !business ||
    !business.whatsAppSettings?.isActive ||
    !phoneNumberId ||
    !businessIdentifiers.includes(phoneNumberId)
  ) {
    return null;
  }

  return business;
}

export async function storeIncomingWhatsAppMessage(params: {
  businessId: string;
  message: ExtractedWhatsAppMessage;
  payload: Prisma.InputJsonValue;
  intent: string;
  role?: WhatsAppMessageRole;
}) {
  const role = params.role ?? "OWNER_FINANCE";
  const providerMessageId = params.message.id;
  const senderPhone = params.message.from;

  if (!providerMessageId || !senderPhone) {
    throw new Error("WhatsApp message membutuhkan provider ID dan nomor pengirim.");
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existingMessage = await tx.whatsAppMessage.findUnique({
          where: { providerMessageId },
          select: existingMessageSelect,
        });

        if (existingMessage) {
          return duplicateResult(existingMessage, params.businessId);
        }

        const contactType =
          role === "OWNER_FINANCE" ? ContactType.OWNER : ContactType.CUSTOMER;
        const contact = await tx.contact.upsert({
          where: {
            businessId_phoneNumber: {
              businessId: params.businessId,
              phoneNumber: senderPhone,
            },
          },
          update: { contactType },
          create: {
            businessId: params.businessId,
            phoneNumber: senderPhone,
            contactType,
          },
        });
        const now = new Date();
        const ownerConversationStatus =
          params.intent === "expense_create"
            ? ConversationStatus.PENDING_CONFIRMATION
            : ConversationStatus.OPEN;
        const conversationId = `${params.businessId}:${contact.id}`;
        const conversation = await tx.whatsAppConversation.upsert({
          where: { id: conversationId },
          update: {
            ...(role === "OWNER_FINANCE" ? { status: ownerConversationStatus } : {}),
            conversationType:
              role === "OWNER_FINANCE"
                ? ConversationType.PERSONAL_FINANCE
                : ConversationType.CUSTOMER_SERVICE,
            channel: "WHATSAPP",
            lastMessageAt: now,
            ...(role === "CUSTOMER_SERVICE"
              ? {
                  lastCustomerMessageAt: now,
                  unreadCount: { increment: 1 },
                }
              : {}),
          },
          create: {
            id: conversationId,
            businessId: params.businessId,
            contactId: contact.id,
            conversationType:
              role === "OWNER_FINANCE"
                ? ConversationType.PERSONAL_FINANCE
                : ConversationType.CUSTOMER_SERVICE,
            status:
              role === "OWNER_FINANCE" ? ownerConversationStatus : ConversationStatus.OPEN,
            channel: "WHATSAPP",
            lastMessageAt: now,
            lastCustomerMessageAt: role === "CUSTOMER_SERVICE" ? now : null,
            unreadCount: role === "CUSTOMER_SERVICE" ? 1 : 0,
          },
        });
        const mediaFile =
          params.message.type === "image" && params.message.image?.id
            ? await tx.mediaFile.create({
                data: {
                  businessId: params.businessId,
                  providerMediaId: params.message.image.id,
                  fileType:
                    role === "OWNER_FINANCE" ? "receipt_image" : "customer_media",
                  mimeType: params.message.image.mime_type,
                },
              })
            : null;
        const storedMessage = await tx.whatsAppMessage.create({
          data: {
            conversationId: conversation.id,
            providerMessageId,
            senderType: role === "OWNER_FINANCE" ? SenderType.USER : SenderType.CUSTOMER,
            messageType:
              params.message.type === "image" ? MessageType.IMAGE : MessageType.TEXT,
            messageBody: params.message.text?.body,
            mediaFileId: mediaFile?.id,
            rawPayload: params.payload,
            intent: params.intent,
            processingStatus: ProcessingStatus.PROCESSED,
            deliveryStatus: "STORED",
          },
        });

        return {
          duplicate: false,
          businessId: params.businessId,
          messageId: storedMessage.id,
          conversationId: conversation.id,
          mediaFileId: mediaFile?.id ?? null,
        };
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const existingMessage = await prisma.whatsAppMessage.findUnique({
        where: { providerMessageId },
        select: existingMessageSelect,
      });
      if (existingMessage) {
        return duplicateResult(existingMessage, params.businessId);
      }

      if (attempt === 2) throw error;
    }
  }

  throw new Error("WhatsApp message tidak dapat disimpan.");
}

const existingMessageSelect = {
  id: true,
  conversationId: true,
  mediaFileId: true,
  conversation: {
    select: {
      businessId: true,
    },
  },
} as const;

function duplicateResult(
  existingMessage: {
    id: string;
    conversationId: string;
    mediaFileId: string | null;
    conversation: { businessId: string };
  },
  businessId: string,
) {
  if (existingMessage.conversation.businessId !== businessId) {
    throw new Error("Provider message ID sudah dipakai workspace lain.");
  }

  return {
    duplicate: true,
    businessId,
    messageId: existingMessage.id,
    conversationId: existingMessage.conversationId,
    mediaFileId: existingMessage.mediaFileId,
  };
}

function businessIdentifierVariants(identifiers: string[]) {
  const variants = new Set<string>();

  for (const identifier of identifiers) {
    const trimmed = identifier.trim();
    const digits = trimmed.replace(/\D/g, "");
    if (trimmed) variants.add(trimmed);
    if (digits) {
      variants.add(digits);
      variants.add(`+${digits}`);
      if (digits.startsWith("62")) variants.add(`0${digits.slice(2)}`);
    }
  }

  return [...variants];
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}
