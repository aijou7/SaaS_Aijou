import {
  CategoryType,
  ConfirmationStatus,
  ConversationStatus,
  Prisma,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma-beta/client";
import { formatCurrencyIDR } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { ExpenseExtraction, IntentResult } from "@/server/ai/intent";

type StoredMessageContext = {
  businessId: string;
  conversationId: string;
  messageId: string;
};

export async function createPendingExpenseFromExtraction(params: {
  context: StoredMessageContext;
  text: string;
  intent: IntentResult;
  extraction: ExpenseExtraction;
}) {
  const { context, extraction } = params;

  if (extraction.totalAmount === null) {
    const reply =
      "Nominalnya belum kebaca. Bisa kirim ulang dengan nominalnya? Contoh: catat beli mouse Rp150.000.";

    await writeAiLog({
      context,
      inputText: params.text,
      outputText: reply,
      intent: params.intent.intent,
      confidenceScore: params.intent.confidenceScore,
      structuredOutput: extraction,
      actionTaken: "clarification_requested",
    });

    await prisma.whatsAppConversation.update({
      where: { id: context.conversationId },
      data: { status: ConversationStatus.OPEN },
    });

    return {
      action: "clarification_requested",
      reply,
    };
  }

  const category = extraction.categoryName
    ? await prisma.category.upsert({
        where: {
          businessId_name_type: {
            businessId: context.businessId,
            name: extraction.categoryName,
            type: CategoryType.EXPENSE,
          },
        },
        update: {},
        create: {
          businessId: context.businessId,
          name: extraction.categoryName,
          type: CategoryType.EXPENSE,
        },
      })
    : null;

  const project = extraction.projectName
    ? await prisma.project.upsert({
        where: {
          businessId_projectName: {
            businessId: context.businessId,
            projectName: extraction.projectName,
          },
        },
        update: {},
        create: {
          businessId: context.businessId,
          projectName: extraction.projectName,
        },
      })
    : null;

  const transaction = await prisma.transaction.create({
    data: {
      businessId: context.businessId,
      conversationId: context.conversationId,
      transactionType: TransactionType.EXPENSE,
      transactionDate: new Date(`${extraction.transactionDate}T00:00:00.000Z`),
      merchantName: extraction.merchantName,
      categoryId: category?.id,
      projectId: project?.id,
      totalAmount: String(extraction.totalAmount),
      description: extraction.description,
      source: TransactionSource.WHATSAPP_TEXT,
      status: TransactionStatus.PENDING_CONFIRMATION,
      confidenceScore: String(extraction.confidenceScore),
    },
  });

  await prisma.confirmationSession.create({
    data: {
      businessId: context.businessId,
      conversationId: context.conversationId,
      transactionId: transaction.id,
      status: ConfirmationStatus.ACTIVE,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    },
  });

  await prisma.whatsAppConversation.update({
    where: { id: context.conversationId },
    data: { status: ConversationStatus.PENDING_CONFIRMATION },
  });

  const reply = buildPendingExpenseReply(extraction);

  await writeAiLog({
    context,
    inputText: params.text,
    outputText: reply,
    intent: params.intent.intent,
    confidenceScore: params.intent.confidenceScore,
    structuredOutput: extraction,
    actionTaken: "pending_transaction_created",
  });

  return {
    action: "pending_transaction_created",
    transactionId: transaction.id,
    reply,
  };
}

export async function confirmActiveExpense(params: {
  context: StoredMessageContext;
  text: string;
  intent: IntentResult;
}) {
  const session = await getActiveConfirmationSession(params.context.conversationId);

  if (!session) {
    const reply = "Tidak ada transaksi yang sedang menunggu konfirmasi.";

    await writeAiLog({
      context: params.context,
      inputText: params.text,
      outputText: reply,
      intent: params.intent.intent,
      confidenceScore: params.intent.confidenceScore,
      actionTaken: "confirmation_not_found",
    });

    return {
      action: "confirmation_not_found",
      reply,
    };
  }

  const [transaction] = await prisma.$transaction([
    prisma.transaction.update({
      where: { id: session.transactionId },
      data: { status: TransactionStatus.CONFIRMED },
    }),
    prisma.confirmationSession.update({
      where: { id: session.id },
      data: { status: ConfirmationStatus.CONFIRMED },
    }),
    prisma.whatsAppConversation.update({
      where: { id: params.context.conversationId },
      data: { status: ConversationStatus.OPEN },
    }),
  ]);

  const reply = `Sip, transaksi ${formatCurrencyIDR(Number(transaction.totalAmount))} sudah saya simpan.`;

  await writeAiLog({
    context: params.context,
    inputText: params.text,
    outputText: reply,
    intent: params.intent.intent,
    confidenceScore: params.intent.confidenceScore,
    actionTaken: "transaction_confirmed",
  });

  return {
    action: "transaction_confirmed",
    transactionId: transaction.id,
    reply,
  };
}

export async function cancelActiveExpense(params: {
  context: StoredMessageContext;
  text: string;
  intent: IntentResult;
}) {
  const session = await getActiveConfirmationSession(params.context.conversationId);

  if (!session) {
    const reply = "Tidak ada transaksi pending yang perlu dibatalkan.";

    await writeAiLog({
      context: params.context,
      inputText: params.text,
      outputText: reply,
      intent: params.intent.intent,
      confidenceScore: params.intent.confidenceScore,
      actionTaken: "cancellation_not_found",
    });

    return {
      action: "cancellation_not_found",
      reply,
    };
  }

  const [transaction] = await prisma.$transaction([
    prisma.transaction.update({
      where: { id: session.transactionId },
      data: { status: TransactionStatus.CANCELLED },
    }),
    prisma.confirmationSession.update({
      where: { id: session.id },
      data: { status: ConfirmationStatus.CANCELLED },
    }),
    prisma.whatsAppConversation.update({
      where: { id: params.context.conversationId },
      data: { status: ConversationStatus.OPEN },
    }),
  ]);

  const reply = "Oke, transaksi pending tadi saya batalkan.";

  await writeAiLog({
    context: params.context,
    inputText: params.text,
    outputText: reply,
    intent: params.intent.intent,
    confidenceScore: params.intent.confidenceScore,
    actionTaken: "transaction_cancelled",
  });

  return {
    action: "transaction_cancelled",
    transactionId: transaction.id,
    reply,
  };
}

async function getActiveConfirmationSession(conversationId: string) {
  const expiredSessions = await prisma.confirmationSession.findMany({
    where: {
      conversationId,
      status: ConfirmationStatus.ACTIVE,
      expiresAt: {
        lt: new Date(),
      },
    },
    select: { id: true },
  });

  if (expiredSessions.length > 0) {
    await prisma.confirmationSession.updateMany({
      where: {
        id: {
          in: expiredSessions.map((session) => session.id),
        },
      },
      data: { status: ConfirmationStatus.EXPIRED },
    });
  }

  return prisma.confirmationSession.findFirst({
    where: {
      conversationId,
      status: ConfirmationStatus.ACTIVE,
      expiresAt: {
        gte: new Date(),
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      transactionId: true,
    },
  });
}

function buildPendingExpenseReply(extraction: ExpenseExtraction) {
  const parts = [
    `Siap, saya baca ini sebagai pengeluaran ${formatCurrencyIDR(extraction.totalAmount ?? 0)}`,
  ];

  if (extraction.description) {
    parts.push(`untuk ${extraction.description}`);
  }

  if (extraction.categoryName) {
    parts.push(`kategori ${extraction.categoryName}`);
  }

  if (extraction.projectName) {
    parts.push(`project ${extraction.projectName}`);
  }

  return `${parts.join(", ")}. Mau saya simpan?`;
}

async function writeAiLog(params: {
  context: StoredMessageContext;
  inputText: string;
  outputText: string;
  intent: string;
  confidenceScore: number;
  structuredOutput?: unknown;
  actionTaken: string;
}) {
  await prisma.aiLog.create({
    data: {
      businessId: params.context.businessId,
      conversationId: params.context.conversationId,
      messageId: params.context.messageId,
      inputText: params.inputText,
      outputText: params.outputText,
      structuredOutput:
        params.structuredOutput === undefined
          ? undefined
          : (JSON.parse(JSON.stringify(params.structuredOutput)) as Prisma.InputJsonValue),
      intent: params.intent,
      confidenceScore: String(params.confidenceScore),
      actionTaken: params.actionTaken,
    },
  });
}
