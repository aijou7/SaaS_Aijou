import {
  buildCustomerServiceReplyAi,
  inferCustomerIntent,
  isHandoffRequest,
} from "@/server/ai/customer-agent";
import {
  ContactType,
  ConversationStatus,
  ConversationType,
  MessageType,
  Prisma,
  ProcessingStatus,
  SenderType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getAgentRuntimeSettings } from "@/server/agent/settings";
import { getActiveKnowledgeContext } from "@/server/knowledge/knowledge-base";
import { getActiveProductContext } from "@/server/products/catalog";
import { upsertLeadSummaryFromConversation } from "@/server/leads/leads";

type SimulateMessageInput = {
  phoneNumber: string;
  displayName?: string;
  message: string;
  conversationType?: ConversationType;
  leadSource?: string;
};

type ConversationInboxFilters = {
  status?: string;
  q?: string;
  unread?: boolean;
};

export async function getConversationsInbox(userId: string, filters: ConversationInboxFilters = {}) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      conversations: [],
      summary: {
        open: 0,
        humanNeeded: 0,
        customerService: 0,
        closed: 0,
        unread: 0,
      },
    };
  }

  const where = buildConversationWhere(business.id, filters);

  const [conversations, open, humanNeeded, customerService, closed] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        conversationType: true,
        status: true,
        lastMessageAt: true,
        ownerLastReadAt: true,
        ownerNotes: true,
        resolvedAt: true,
        contact: {
          select: {
            displayName: true,
            phoneNumber: true,
            contactType: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            messageBody: true,
            senderType: true,
            createdAt: true,
          },
        },
        _count: {
          select: { messages: true },
        },
        leads: {
          take: 1,
          select: {
            status: true,
            qualificationScore: true,
            source: true,
            serviceInterest: true,
          },
        },
      },
    }),
    prisma.whatsAppConversation.count({
      where: { businessId: business.id, status: ConversationStatus.OPEN },
    }),
    prisma.whatsAppConversation.count({
      where: { businessId: business.id, status: ConversationStatus.HUMAN_NEEDED },
    }),
    prisma.whatsAppConversation.count({
      where: { businessId: business.id, conversationType: ConversationType.CUSTOMER_SERVICE },
    }),
    prisma.whatsAppConversation.count({
      where: { businessId: business.id, status: ConversationStatus.CLOSED },
    }),
  ]);

  const visibleConversations = filters.unread
    ? conversations.filter((conversation) => getUnreadCount(conversation) > 0)
    : conversations;

  return {
    business,
    summary: {
      open,
      humanNeeded,
      customerService,
      closed,
      unread: conversations.reduce((sum, conversation) => sum + getUnreadCount(conversation), 0),
    },
    conversations: visibleConversations.map((conversation) => ({
      id: conversation.id,
      conversationType: conversation.conversationType,
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      ownerLastReadAt: conversation.ownerLastReadAt?.toISOString() ?? null,
      ownerNotes: conversation.ownerNotes,
      resolvedAt: conversation.resolvedAt?.toISOString() ?? null,
      contactName: conversation.contact?.displayName ?? conversation.contact?.phoneNumber ?? "Unknown",
      contactPhone: conversation.contact?.phoneNumber ?? "-",
      contactType: conversation.contact?.contactType ?? ContactType.UNKNOWN,
      messageCount: conversation._count.messages,
      lastMessage: conversation.messages[0]?.messageBody ?? "",
      lastSender: conversation.messages[0]?.senderType ?? null,
      unreadCount: getUnreadCount(conversation),
      lead: conversation.leads[0] ?? null,
    })),
  };
}

export async function getConversationDetail(userId: string, conversationId?: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return null;
  }

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: {
      businessId: business.id,
      ...(conversationId ? { id: conversationId } : {}),
    },
    orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      conversationType: true,
      status: true,
      lastMessageAt: true,
      ownerLastReadAt: true,
      ownerNotes: true,
      resolvedAt: true,
      contact: {
        select: {
          displayName: true,
          phoneNumber: true,
          contactType: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true,
          senderType: true,
          messageType: true,
          messageBody: true,
          intent: true,
          createdAt: true,
        },
      },
      leads: {
        take: 1,
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          needSummary: true,
          serviceInterest: true,
          location: true,
          budget: true,
          urgency: true,
          source: true,
          qualificationScore: true,
          estimatedValueMin: true,
          estimatedValueMax: true,
          estimateNote: true,
          nextStep: true,
          nextFollowUpAt: true,
          followUpReason: true,
          status: true,
          ownerNotes: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!conversation) {
    return null;
  }

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: { ownerLastReadAt: new Date() },
  });

  return {
    id: conversation.id,
    conversationType: conversation.conversationType,
    status: conversation.status,
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    ownerLastReadAt: conversation.ownerLastReadAt?.toISOString() ?? null,
    ownerNotes: conversation.ownerNotes,
    resolvedAt: conversation.resolvedAt?.toISOString() ?? null,
    contactName: conversation.contact?.displayName ?? conversation.contact?.phoneNumber ?? "Unknown",
    contactPhone: conversation.contact?.phoneNumber ?? "-",
    contactType: conversation.contact?.contactType ?? ContactType.UNKNOWN,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      senderType: message.senderType,
      messageType: message.messageType,
      messageBody: message.messageBody ?? "",
      intent: message.intent,
      createdAt: message.createdAt.toISOString(),
    })),
    lead: conversation.leads[0]
      ? {
          ...conversation.leads[0],
          estimatedValueMin: conversation.leads[0].estimatedValueMin?.toString() ?? null,
          estimatedValueMax: conversation.leads[0].estimatedValueMax?.toString() ?? null,
          nextFollowUpAt: conversation.leads[0].nextFollowUpAt?.toISOString() ?? null,
          updatedAt: conversation.leads[0].updatedAt.toISOString(),
        }
      : null,
  };
}

export async function simulateCustomerMessage(userId: string, input: SimulateMessageInput) {
  const business = await requireBusinessForUser(userId);
  const contact = await upsertContact({
    businessId: business.id,
    phoneNumber: input.phoneNumber,
    displayName: input.displayName,
    contactType: ContactType.CUSTOMER,
  });
  const conversation = await upsertConversation({
    businessId: business.id,
    contactId: contact.id,
    conversationType: input.conversationType ?? ConversationType.CUSTOMER_SERVICE,
    status: ConversationStatus.OPEN,
  });

  const customerMessage = await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      providerMessageId: `sim-${crypto.randomUUID()}`,
      senderType: SenderType.CUSTOMER,
      messageType: MessageType.TEXT,
      messageBody: input.message,
      intent: inferCustomerIntent(input.message),
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });

  const handoffRequested = isHandoffRequest(input.message);
  const currentConversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversation.id },
    select: { status: true },
  });

  let aiReply: string | null = null;
  let nextStatus = currentConversation?.status ?? conversation.status;
  const settings = await getAgentRuntimeSettings(business.id);

  if (!settings.isActive) {
    nextStatus = ConversationStatus.HUMAN_NEEDED;
  } else if (handoffRequested) {
    nextStatus = ConversationStatus.HUMAN_NEEDED;
    aiReply = `${settings.agentName}: Baik, saya panggilkan owner/admin untuk lanjut bantu ya.`;
  } else if (currentConversation?.status !== ConversationStatus.HUMAN_NEEDED) {
    const [knowledgeContext, productContext, messages] = await Promise.all([
      getActiveKnowledgeContext(business.id),
      getActiveProductContext(business.id),
      prisma.whatsAppMessage.findMany({
        where: { conversationId: conversation.id, messageType: MessageType.TEXT },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { senderType: true, messageBody: true },
      }),
    ]);
    aiReply = await buildCustomerServiceReplyAi({
      message: input.message,
      knowledgeContext: `${knowledgeContext}\n\nKatalog aktif:\n${productContext}`,
      conversationContext: messages
        .reverse()
        .map((item) => `${item.senderType === SenderType.CUSTOMER ? "Customer" : "Aijou"}: ${item.messageBody ?? ""}`)
        .join("\n"),
      settings,
    });
  }

  if (aiReply) {
    const aiMessage = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        providerMessageId: `sim-ai-${crypto.randomUUID()}`,
        senderType: SenderType.AI,
        messageType: MessageType.TEXT,
        messageBody: aiReply,
        intent: "customer_service_reply",
        processingStatus: ProcessingStatus.PROCESSED,
      },
    });

    await prisma.aiLog.create({
      data: {
        businessId: business.id,
        conversationId: conversation.id,
        messageId: aiMessage.id,
        inputText: input.message,
        outputText: aiReply,
        intent: handoffRequested ? "handoff_request" : "customer_service_reply",
        confidenceScore: handoffRequested ? "0.95" : "0.82",
        actionTaken: handoffRequested
          ? "handoff_reply_created"
          : "customer_service_reply_created",
      },
    });
  }

  await prisma.whatsAppConversation.update({
    where: { id: conversation.id },
    data: {
      status: nextStatus,
      lastMessageAt: new Date(),
    },
  });

  const leadSummary = await upsertLeadSummaryFromConversation(conversation.id, {
    source: input.leadSource,
  });

  return {
    conversationId: conversation.id,
    customerMessageId: customerMessage.id,
    aiReply,
    status: nextStatus,
    leadSummary,
  };
}

export async function setConversationTakeover(userId: string, conversationId: string, takeover: boolean) {
  const business = await requireBusinessForUser(userId);
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    select: { id: true },
  });

  if (!conversation) {
    throw new Error("Conversation tidak ditemukan.");
  }

  const status = takeover ? ConversationStatus.HUMAN_NEEDED : ConversationStatus.OPEN;

  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      status,
      resolvedAt: null,
      ownerLastReadAt: new Date(),
    },
  });

  await prisma.whatsAppMessage.create({
    data: {
      conversationId,
      providerMessageId: `system-${crypto.randomUUID()}`,
      senderType: SenderType.SYSTEM,
      messageType: MessageType.SYSTEM,
      messageBody: takeover ? "Human takeover aktif. AI auto-reply berhenti." : "AI auto-reply aktif kembali.",
      intent: takeover ? "human_takeover_enabled" : "human_takeover_released",
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });
}

export async function resolveConversation(userId: string, conversationId: string) {
  const business = await requireBusinessForUser(userId);
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    select: { id: true },
  });

  if (!conversation) {
    throw new Error("Conversation tidak ditemukan.");
  }

  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      status: ConversationStatus.CLOSED,
      resolvedAt: new Date(),
      ownerLastReadAt: new Date(),
    },
  });

  await prisma.whatsAppMessage.create({
    data: {
      conversationId,
      providerMessageId: `system-${crypto.randomUUID()}`,
      senderType: SenderType.SYSTEM,
      messageType: MessageType.SYSTEM,
      messageBody: "Conversation ditandai resolved oleh owner.",
      intent: "conversation_resolved",
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });
}

export async function updateConversationOwnerNotes(
  userId: string,
  conversationId: string,
  ownerNotes: string,
) {
  const business = await requireBusinessForUser(userId);
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    select: { id: true },
  });

  if (!conversation) {
    throw new Error("Conversation tidak ditemukan.");
  }

  return prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      ownerNotes: ownerNotes.trim() || null,
    },
  });
}

export async function sendOwnerConversationReply(userId: string, conversationId: string, message: string) {
  const business = await requireBusinessForUser(userId);
  const trimmed = message.trim();

  if (!trimmed) {
    throw new Error("Message tidak boleh kosong.");
  }

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: conversationId, businessId: business.id },
    select: { id: true },
  });

  if (!conversation) {
    throw new Error("Conversation tidak ditemukan.");
  }

  await prisma.whatsAppMessage.create({
    data: {
      conversationId,
      providerMessageId: `owner-${crypto.randomUUID()}`,
      senderType: SenderType.USER,
      messageType: MessageType.TEXT,
      messageBody: trimmed,
      intent: "owner_reply",
      processingStatus: ProcessingStatus.PROCESSED,
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: conversationId },
    data: {
      status: ConversationStatus.HUMAN_NEEDED,
      lastMessageAt: new Date(),
      ownerLastReadAt: new Date(),
    },
  });
}

export function formatConversationStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatConversationType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildConversationWhere(businessId: string, filters: ConversationInboxFilters) {
  const where: Prisma.WhatsAppConversationWhereInput = { businessId };

  if (filters.status && isConversationStatus(filters.status)) {
    where.status = filters.status;
  }

  const q = filters.q?.trim();
  if (q) {
    where.OR = [
      {
        contact: {
          displayName: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
      {
        contact: {
          phoneNumber: {
            contains: q,
            mode: "insensitive",
          },
        },
      },
      {
        ownerNotes: {
          contains: q,
          mode: "insensitive",
        },
      },
      {
        messages: {
          some: {
            messageBody: {
              contains: q,
              mode: "insensitive",
            },
          },
        },
      },
    ];
  }

  return where;
}

function isConversationStatus(value: string): value is ConversationStatus {
  return Object.values(ConversationStatus).includes(value as ConversationStatus);
}

function getUnreadCount(conversation: {
  ownerLastReadAt: Date | null;
  messages: Array<{
    senderType: SenderType;
    createdAt: Date;
  }>;
}) {
  return conversation.messages.filter(
    (message) =>
      message.senderType === SenderType.CUSTOMER &&
      (!conversation.ownerLastReadAt || message.createdAt > conversation.ownerLastReadAt),
  ).length;
}

async function upsertContact(params: {
  businessId: string;
  phoneNumber: string;
  displayName?: string;
  contactType: ContactType;
}) {
  return prisma.contact.upsert({
    where: {
      businessId_phoneNumber: {
        businessId: params.businessId,
        phoneNumber: params.phoneNumber,
      },
    },
    update: {
      displayName: params.displayName,
      contactType: params.contactType,
    },
    create: {
      businessId: params.businessId,
      phoneNumber: params.phoneNumber,
      displayName: params.displayName,
      contactType: params.contactType,
    },
  });
}

async function upsertConversation(params: {
  businessId: string;
  contactId: string;
  conversationType: ConversationType;
  status: ConversationStatus;
}) {
  return prisma.whatsAppConversation.upsert({
    where: {
      id: `${params.businessId}:${params.contactId}`,
    },
    update: {
      conversationType: params.conversationType,
      lastMessageAt: new Date(),
    },
    create: {
      id: `${params.businessId}:${params.contactId}`,
      businessId: params.businessId,
      contactId: params.contactId,
      conversationType: params.conversationType,
      status: params.status,
      lastMessageAt: new Date(),
    },
  });
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  return business;
}
