import {
  ConversationStatus,
  ConversationType,
  LeadStatus,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";

export async function getFinanceDashboardSnapshot(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: {
      id: true,
      businessName: true,
    },
  });

  if (!business) {
    return {
      businessName: null,
      totalThisMonth: 0,
      receiptReviewCount: 0,
      confirmedCount: 0,
      humanNeededCount: 0,
      customerConversationCount: 0,
      pendingTransactionCount: 0,
      newLeadCount: 0,
      unreadConversationCount: 0,
      hotLeadCount: 0,
      dueFollowUpCount: 0,
      latestAiActions: [],
      recentTransactions: [],
    };
  }

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const followUpDueAt = new Date();
  const [
    totalThisMonth,
    receiptReviewCount,
    confirmedCount,
    humanNeededCount,
    customerConversationCount,
    pendingTransactionCount,
    newLeadCount,
    unreadConversationCount,
    hotLeadCount,
    dueFollowUpCount,
    latestAiActions,
    recentTransactions,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        businessId: business.id,
        transactionType: TransactionType.INCOME,
        status: TransactionStatus.CONFIRMED,
        transactionDate: {
          gte: startOfMonth,
        },
      },
      _sum: {
        totalAmount: true,
      },
    }),
    prisma.transaction.count({
      where: {
        businessId: business.id,
        status: TransactionStatus.NEEDS_REVIEW,
      },
    }),
    prisma.transaction.count({
      where: {
        businessId: business.id,
        transactionType: TransactionType.INCOME,
        status: TransactionStatus.CONFIRMED,
      },
    }),
    prisma.whatsAppConversation.count({
      where: {
        businessId: business.id,
        status: ConversationStatus.HUMAN_NEEDED,
      },
    }),
    prisma.whatsAppConversation.count({
      where: {
        businessId: business.id,
        conversationType: ConversationType.CUSTOMER_SERVICE,
      },
    }),
    prisma.transaction.count({
      where: {
        businessId: business.id,
        status: TransactionStatus.PENDING_CONFIRMATION,
      },
    }),
    prisma.lead.count({
      where: {
        businessId: business.id,
        status: LeadStatus.NEW,
      },
    }),
    prisma.whatsAppConversation.count({
      where: {
        businessId: business.id,
        conversationType: ConversationType.CUSTOMER_SERVICE,
        unreadCount: { gt: 0 },
      },
    }),
    prisma.lead.count({
      where: {
        businessId: business.id,
        qualificationScore: { gte: 70 },
        status: { notIn: [LeadStatus.WON, LeadStatus.LOST, LeadStatus.CLOSED, LeadStatus.SPAM] },
      },
    }),
    prisma.lead.count({
      where: {
        businessId: business.id,
        nextFollowUpAt: { lte: followUpDueAt },
        status: { notIn: [LeadStatus.WON, LeadStatus.LOST, LeadStatus.CLOSED, LeadStatus.SPAM] },
      },
    }),
    prisma.aiLog.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        actionTaken: true,
        intent: true,
        outputText: true,
        confidenceScore: true,
        createdAt: true,
        conversationId: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        businessId: business.id,
        transactionType: TransactionType.INCOME,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 8,
      select: {
        id: true,
        description: true,
        merchantName: true,
        totalAmount: true,
        source: true,
        status: true,
        category: {
          select: {
            name: true,
          },
        },
        project: {
          select: {
            projectName: true,
          },
        },
      },
    }),
  ]);

  return {
    businessName: business.businessName,
    totalThisMonth: Number(totalThisMonth._sum.totalAmount ?? 0),
    receiptReviewCount,
    confirmedCount,
    humanNeededCount,
    customerConversationCount,
    pendingTransactionCount,
    newLeadCount,
    unreadConversationCount,
    hotLeadCount,
    dueFollowUpCount,
    latestAiActions: latestAiActions.map((action) => ({
      id: action.id,
      actionTaken: action.actionTaken ?? "-",
      intent: action.intent ?? "-",
      outputText: action.outputText ?? "",
      confidenceScore: action.confidenceScore === null ? null : Number(action.confidenceScore),
      createdAt: action.createdAt.toISOString(),
      conversationId: action.conversationId,
    })),
    recentTransactions: recentTransactions.map((transaction) => ({
      id: transaction.id,
      description: transaction.description ?? transaction.merchantName ?? "Transaksi tanpa deskripsi",
      category: transaction.category?.name ?? "-",
      project: transaction.project?.projectName ?? "-",
      source: transaction.source,
      amount: Number(transaction.totalAmount),
      status: transaction.status,
    })),
  };
}
