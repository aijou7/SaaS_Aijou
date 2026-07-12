import { createHash } from "node:crypto";
import { after } from "next/server";
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
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { getAgentRuntimeSettings } from "@/server/agent/settings";
import { getActiveKnowledgeContext } from "@/server/knowledge/knowledge-base";
import { getActiveProductContext } from "@/server/products/catalog";
import {
  enqueueLeadRefresh,
  processPendingJobs,
} from "@/server/jobs/background-jobs";
import { sendWhatsAppTextMessage } from "@/server/whatsapp/client";

type SimulateMessageInput = {
  phoneNumber: string;
  displayName?: string;
  message: string;
  conversationType?: ConversationType;
  leadSource?: string;
  providerMessageId?: string;
  rawPayload?: Prisma.InputJsonValue;
};

type ConversationInboxFilters = {
  status?: string;
  q?: string;
  unread?: boolean;
  page?: number;
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
      pagination: { page: 1, pageSize: 30, total: 0, pageCount: 1 },
    };
  }

  const where = buildConversationWhere(business.id, filters);
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = 30;

  const [conversations, total, open, humanNeeded, customerService, closed, unread] = await Promise.all([
    prisma.whatsAppConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        conversationType: true,
        status: true,
        lastMessageAt: true,
        ownerLastReadAt: true,
        ownerNotes: true,
        resolvedAt: true,
        unreadCount: true,
        contact: {
          select: {
            displayName: true,
            phoneNumber: true,
            contactType: true,
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
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
    prisma.whatsAppConversation.count({ where }),
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
    prisma.whatsAppConversation.aggregate({
      where: { businessId: business.id },
      _sum: { unreadCount: true },
    }),
  ]);

  return {
    business,
    summary: {
      open,
      humanNeeded,
      customerService,
      closed,
      unread: unread._sum.unreadCount ?? 0,
    },
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
    conversations: conversations.map((conversation) => ({
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
      unreadCount: conversation.unreadCount,
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
        orderBy: { createdAt: "desc" },
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
    data: { ownerLastReadAt: new Date(), unreadCount: 0 },
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
    messages: [...conversation.messages].reverse().map((message) => ({
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
  return simulateCustomerMessageForResolvedBusiness(business, input);
}

export async function simulateCustomerMessageForBusiness(
  businessId: string,
  input: SimulateMessageInput,
) {
  const business = await requireBusinessById(businessId);
  return simulateCustomerMessageForResolvedBusiness(business, input);
}

async function simulateCustomerMessageForResolvedBusiness(
  business: { id: string; businessName: string },
  input: SimulateMessageInput,
) {
  const providerMessageId = input.providerMessageId ?? `sim-${crypto.randomUUID()}`;
  const duplicateResult = input.providerMessageId
    ? await findDuplicateCustomerMessageResult(business.id, providerMessageId)
    : null;

  if (duplicateResult) return duplicateResult;

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
    channel: input.leadSource === "WHATSAPP" ? "WHATSAPP" : "WEB_CHAT",
  });

  const customerMessage = await prisma.whatsAppMessage
    .create({
      data: {
        conversationId: conversation.id,
        providerMessageId,
        senderType: SenderType.CUSTOMER,
        messageType: MessageType.TEXT,
        messageBody: input.message,
        rawPayload: input.rawPayload,
        intent: inferCustomerIntent(input.message),
        processingStatus: ProcessingStatus.PROCESSED,
        deliveryStatus: "STORED",
      },
    })
    .catch(async (error: unknown) => {
      if (!input.providerMessageId || !isUniqueConstraintError(error)) throw error;
      return null;
    });

  if (!customerMessage) {
    const racedDuplicate = await findDuplicateCustomerMessageResult(
      business.id,
      providerMessageId,
    );
    if (racedDuplicate) return racedDuplicate;
    throw new Error("Provider message duplicate belum dapat dipulihkan.");
  }

  const handoffRequested = isHandoffRequest(input.message);
  const currentConversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversation.id },
    select: { status: true },
  });

  let aiReply: string | null = null;
  let aiMessageId: string | null = null;
  let nextStatus = currentConversation?.status ?? conversation.status;
  if (
    nextStatus === ConversationStatus.PENDING_CONFIRMATION ||
    nextStatus === ConversationStatus.CLOSED
  ) {
    nextStatus = ConversationStatus.OPEN;
  }
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
        take: 40,
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
    const isWhatsApp = input.leadSource === "WHATSAPP";
    const aiMessage = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        providerMessageId: internalOutboundId("ai", providerMessageId),
        senderType: SenderType.AI,
        messageType: MessageType.TEXT,
        messageBody: aiReply,
        intent: "customer_service_reply",
        processingStatus: ProcessingStatus.PROCESSED,
        deliveryStatus: isWhatsApp ? "PENDING" : "STORED",
        rawPayload: toJsonValue({
          channel: isWhatsApp ? "WHATSAPP" : "WEB_CHAT",
          direction: "OUTBOUND",
          inReplyToProviderMessageId: providerMessageId,
        }),
      },
    });
    aiMessageId = aiMessage.id;

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
      lastCustomerMessageAt: new Date(),
      unreadCount: { increment: 1 },
    },
  });

  await enqueueLeadRefresh({
    businessId: business.id,
    conversationId: conversation.id,
    source: input.leadSource,
  });
  after(async () => {
    await processPendingJobs(2);
  });

  return {
    conversationId: conversation.id,
    customerMessageId: customerMessage.id,
    aiMessageId,
    aiReply,
    status: nextStatus,
    leadSummary: null,
    deduped: false,
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
  return sendConversationOwnerMessage({
    businessId: business.id,
    conversationId,
    message,
    intent: "owner_reply",
    providerMessagePrefix: "owner",
  });
}

export async function sendConversationOwnerMessage(params: {
  businessId: string;
  conversationId: string;
  message: string;
  intent: string;
  providerMessagePrefix?: string;
  idempotencyKey?: string;
}) {
  const trimmed = params.message.trim();

  if (!trimmed) {
    throw new Error("Message tidak boleh kosong.");
  }

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: params.conversationId, businessId: params.businessId },
    select: {
      id: true,
      contact: { select: { phoneNumber: true } },
      messages: {
        where: { rawPayload: { not: Prisma.DbNull } },
        orderBy: { createdAt: "desc" },
        take: 25,
        select: { rawPayload: true },
      },
    },
  });

  if (!conversation) {
    throw new Error("Conversation tidak ditemukan.");
  }

  const isWhatsAppConversation = conversation.messages.some((item) =>
    isWhatsAppInboundPayload(item.rawPayload),
  );
  const internalProviderMessageId = params.idempotencyKey
    ? internalOutboundId(params.providerMessagePrefix ?? "owner", params.idempotencyKey)
    : `${params.providerMessagePrefix ?? "owner"}-${crypto.randomUUID()}`;
  const outboundPayload = toJsonValue({
    channel: isWhatsAppConversation ? "WHATSAPP" : "WEB_CHAT",
    direction: "OUTBOUND",
    idempotencyKey: params.idempotencyKey ?? null,
  });
  let outgoingMessage = params.idempotencyKey
    ? await findIdempotentOutgoingMessage(
        params.conversationId,
        internalProviderMessageId,
        params.idempotencyKey,
      )
    : null;

  if (outgoingMessage && outgoingMessage.messageBody !== trimmed) {
    throw new Error("Idempotency key sudah dipakai untuk isi pesan berbeda.");
  }

  if (!outgoingMessage) {
    try {
      outgoingMessage = await prisma.whatsAppMessage.create({
        data: {
          conversationId: params.conversationId,
          providerMessageId: internalProviderMessageId,
          senderType: SenderType.USER,
          messageType: MessageType.TEXT,
          messageBody: trimmed,
          intent: params.intent,
          processingStatus: isWhatsAppConversation
            ? ProcessingStatus.RECEIVED
            : ProcessingStatus.PROCESSED,
          deliveryStatus: isWhatsAppConversation ? "PENDING" : "STORED",
          rawPayload: outboundPayload,
        },
        select: {
          id: true,
          messageBody: true,
        },
      });
    } catch (error) {
      if (!params.idempotencyKey || !isUniqueConstraintError(error)) throw error;
      outgoingMessage = await findIdempotentOutgoingMessage(
        params.conversationId,
        internalProviderMessageId,
        params.idempotencyKey,
      );
      if (!outgoingMessage) throw error;
      if (outgoingMessage.messageBody !== trimmed) {
        throw new Error("Idempotency key sudah dipakai untuk isi pesan berbeda.");
      }
    }
  }

  await prisma.whatsAppConversation.update({
    where: { id: params.conversationId },
    data: {
      status: ConversationStatus.HUMAN_NEEDED,
      lastMessageAt: new Date(),
      ownerLastReadAt: new Date(),
    },
  });

  if (!isWhatsAppConversation) {
    return {
      channel: "WEB_CHAT" as const,
      accepted: true,
      delivered: true,
      messageId: outgoingMessage.id,
      providerMessageId: internalProviderMessageId,
      deliveryStatus: "STORED",
    };
  }

  const recipient = conversation.contact?.phoneNumber?.trim();
  if (!recipient) {
    await prisma.whatsAppMessage.update({
      where: { id: outgoingMessage.id },
      data: {
        deliveryStatus: "FAILED",
        deliveryError: "whatsapp_recipient_missing",
        processingStatus: ProcessingStatus.FAILED,
      },
    });
    throw new Error("Pesan tersimpan, tetapi nomor WhatsApp penerima tidak tersedia.");
  }

  const delivery = await deliverStoredWhatsAppTextMessage({
    businessId: params.businessId,
    messageId: outgoingMessage.id,
    to: recipient,
  });
  if (!delivery.accepted) {
    throw new Error(
      `Pesan tersimpan, tetapi belum diterima WhatsApp (${delivery.reason ?? delivery.deliveryStatus}).`,
    );
  }

  return {
    channel: "WHATSAPP" as const,
    accepted: true,
    delivered: delivery.delivered,
    messageId: outgoingMessage.id,
    providerMessageId: delivery.providerMessageId,
    deliveryStatus: delivery.deliveryStatus,
  };
}

export async function sendAutomatedWhatsAppReply(params: {
  businessId: string;
  conversationId: string;
  to: string;
  body: string;
  intent: string;
  sourceProviderMessageId: string;
}) {
  const body = params.body.trim();
  if (!body) throw new Error("Balasan WhatsApp tidak boleh kosong.");

  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { id: params.conversationId, businessId: params.businessId },
    select: { id: true },
  });
  if (!conversation) throw new Error("Conversation tidak ditemukan.");

  // One automated reply per inbound provider message. The intent must not be
  // part of the key because webhook retries are classified as duplicates.
  const idempotencyKey = `auto:${params.sourceProviderMessageId}`;
  const internalProviderMessageId = internalOutboundId("auto", idempotencyKey);
  let message = await findIdempotentOutgoingMessage(
    params.conversationId,
    internalProviderMessageId,
    idempotencyKey,
  );

  if (message && message.messageBody !== body) {
    throw new Error("Balasan otomatis untuk pesan ini sudah memiliki isi berbeda.");
  }

  if (!message) {
    try {
      message = await prisma.whatsAppMessage.create({
        data: {
          conversationId: params.conversationId,
          providerMessageId: internalProviderMessageId,
          senderType: SenderType.AI,
          messageType: MessageType.TEXT,
          messageBody: body,
          intent: params.intent,
          processingStatus: ProcessingStatus.RECEIVED,
          deliveryStatus: "PENDING",
          rawPayload: toJsonValue({
            channel: "WHATSAPP",
            direction: "OUTBOUND",
            idempotencyKey,
            inReplyToProviderMessageId: params.sourceProviderMessageId,
          }),
        },
        select: { id: true, messageBody: true },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      message = await findIdempotentOutgoingMessage(
        params.conversationId,
        internalProviderMessageId,
        idempotencyKey,
      );
      if (!message) throw error;
    }
  }

  const delivery = await deliverStoredWhatsAppTextMessage({
    businessId: params.businessId,
    messageId: message.id,
    to: params.to,
  });

  return {
    ...delivery,
    messageId: message.id,
  };
}

export async function deliverStoredWhatsAppTextMessage(params: {
  businessId: string;
  messageId: string;
  to: string;
}) {
  const message = await prisma.whatsAppMessage.findFirst({
    where: {
      id: params.messageId,
      conversation: { businessId: params.businessId },
    },
    select: {
      id: true,
      providerMessageId: true,
      messageBody: true,
      rawPayload: true,
      deliveryStatus: true,
    },
  });

  if (!message?.messageBody) {
    throw new Error("Pesan outbound WhatsApp tidak ditemukan.");
  }

  if (["ACCEPTED", "DELIVERED", "READ"].includes(message.deliveryStatus)) {
    return {
      accepted: true as const,
      delivered: message.deliveryStatus === "DELIVERED" || message.deliveryStatus === "READ",
      deliveryStatus: message.deliveryStatus,
      providerMessageId: message.providerMessageId,
      reason: null,
    };
  }

  const claim = await prisma.whatsAppMessage.updateMany({
    where: {
      id: message.id,
      deliveryStatus: "PENDING",
      conversation: { businessId: params.businessId },
    },
    data: {
      deliveryStatus: "SENDING",
      deliveryError: null,
      processingStatus: ProcessingStatus.RECEIVED,
    },
  });

  if (claim.count === 0) {
    const current = await prisma.whatsAppMessage.findUnique({
      where: { id: message.id },
      select: { deliveryStatus: true, providerMessageId: true, deliveryError: true },
    });
    const accepted =
      ["ACCEPTED", "DELIVERED", "READ"].includes(current?.deliveryStatus ?? "");
    return {
      accepted,
      delivered: current?.deliveryStatus === "DELIVERED" || current?.deliveryStatus === "READ",
      deliveryStatus: current?.deliveryStatus ?? "UNKNOWN",
      providerMessageId: current?.providerMessageId ?? message.providerMessageId,
      reason: accepted ? null : current?.deliveryError ?? "whatsapp_delivery_already_claimed",
    };
  }

  let delivery: Awaited<ReturnType<typeof sendWhatsAppTextMessage>>;
  try {
    delivery = await sendWhatsAppTextMessage({
      businessId: params.businessId,
      body: message.messageBody,
      to: params.to,
    });
  } catch {
    delivery = {
      sent: false as const,
      reason: "whatsapp_delivery_exception",
      providerMessageId: null,
    };
  }

  const reason = delivery.sent ? null : delivery.reason;
  const responseStatus = "status" in delivery ? delivery.status ?? null : null;
  const uncertain =
    !delivery.sent &&
    (reason === "whatsapp_request_timeout" ||
      reason === "whatsapp_network_error" ||
      reason === "whatsapp_delivery_exception" ||
      reason === "whatsapp_provider_message_id_missing" ||
      (typeof responseStatus === "number" && responseStatus >= 500));
  const deliveryStatus = delivery.sent ? "ACCEPTED" : uncertain ? "UNKNOWN" : "FAILED";
  const previousPayload = jsonObject(message.rawPayload);
  const deliveryPayload = toJsonValue({
    ...previousPayload,
    delivery: {
      accepted: delivery.sent,
      delivered: false,
      providerMessageId: delivery.providerMessageId,
      reason,
      status: responseStatus,
      response: "body" in delivery ? delivery.body ?? null : null,
    },
  });

  await prisma.whatsAppMessage.update({
    where: { id: message.id },
    data: {
      providerMessageId: delivery.sent
        ? delivery.providerMessageId
        : message.providerMessageId,
      processingStatus: delivery.sent ? ProcessingStatus.PROCESSED : ProcessingStatus.FAILED,
      deliveryStatus,
      deliveryError: reason,
      rawPayload: deliveryPayload,
    },
  });

  return {
    accepted: delivery.sent,
    delivered: false,
    deliveryStatus,
    providerMessageId: delivery.sent
      ? delivery.providerMessageId
      : message.providerMessageId,
    reason,
  };
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
  } else {
    where.status = { not: ConversationStatus.CLOSED };
  }

  if (filters.unread) {
    where.unreadCount = { gt: 0 };
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
  channel: "WHATSAPP" | "WEB_CHAT";
}) {
  return prisma.whatsAppConversation.upsert({
    where: {
      id: `${params.businessId}:${params.contactId}`,
    },
    update: {
      conversationType: params.conversationType,
      channel: params.channel,
      lastMessageAt: new Date(),
    },
    create: {
      id: `${params.businessId}:${params.contactId}`,
      businessId: params.businessId,
      contactId: params.contactId,
      conversationType: params.conversationType,
      status: params.status,
      channel: params.channel,
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

async function requireBusinessById(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, businessName: true },
  });

  if (!business) {
    throw new Error("Business tidak ditemukan.");
  }

  return business;
}

function isWhatsAppInboundPayload(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  if ("channel" in value && value.channel === "WHATSAPP") {
    return true;
  }

  return "entry" in value && Array.isArray(value.entry);
}

function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function findDuplicateCustomerMessageResult(
  businessId: string,
  providerMessageId: string,
) {
  const duplicateMessage = await prisma.whatsAppMessage.findUnique({
    where: { providerMessageId },
    select: {
      id: true,
      conversationId: true,
      createdAt: true,
      conversation: { select: { businessId: true, status: true } },
    },
  });

  if (!duplicateMessage) return null;
  if (duplicateMessage.conversation.businessId !== businessId) {
    throw new Error("Provider message ID sudah dipakai workspace lain.");
  }

  const linkedAiReply =
    (await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId: duplicateMessage.conversationId,
        senderType: SenderType.AI,
        messageType: MessageType.TEXT,
        rawPayload: {
          path: ["inReplyToProviderMessageId"],
          equals: providerMessageId,
        },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, messageBody: true },
    })) ??
    (await prisma.whatsAppMessage.findFirst({
      where: {
        conversationId: duplicateMessage.conversationId,
        senderType: SenderType.AI,
        messageType: MessageType.TEXT,
        createdAt: { gte: duplicateMessage.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, messageBody: true },
    }));

  return {
    conversationId: duplicateMessage.conversationId,
    customerMessageId: duplicateMessage.id,
    aiMessageId: linkedAiReply?.id ?? null,
    aiReply: linkedAiReply?.messageBody ?? null,
    status: duplicateMessage.conversation.status,
    leadSummary: null,
    deduped: true,
  };
}

async function findIdempotentOutgoingMessage(
  conversationId: string,
  internalProviderMessageId: string,
  idempotencyKey: string,
) {
  return prisma.whatsAppMessage.findFirst({
    where: {
      conversationId,
      OR: [
        { providerMessageId: internalProviderMessageId },
        {
          rawPayload: {
            path: ["idempotencyKey"],
            equals: idempotencyKey,
          },
        },
      ],
    },
    select: { id: true, messageBody: true },
  });
}

function internalOutboundId(prefix: string, value: string) {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 40);
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 24) || "out";
  return `${safePrefix}-${digest}`;
}

function jsonObject(value: Prisma.JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}
