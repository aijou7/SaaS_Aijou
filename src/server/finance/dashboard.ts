import {
  ConversationStatus,
  ConversationType,
  LeadStatus,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma-beta/client";
import { prisma, withDatabaseRawReadRetry } from "@/lib/prisma";

type DashboardAggregateRow = {
  totalThisMonth: string;
  receiptReviewCount: number;
  confirmedCount: number;
  humanNeededCount: number;
  customerConversationCount: number;
  pendingTransactionCount: number;
  newLeadCount: number;
  unreadConversationCount: number;
  hotLeadCount: number;
  dueFollowUpCount: number;
};

export async function getFinanceDashboardSnapshot(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      onboardingCompleted: true,
    },
  });

  if (!business) {
    return {
      businessName: null,
      onboardingCompleted: false,
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
  const [aggregateRows, latestAiActions, recentTransactions] = await Promise.all([
    withDatabaseRawReadRetry(() => prisma.$queryRaw<DashboardAggregateRow[]>`
      WITH transaction_stats AS (
        SELECT
          COALESCE(
            SUM("totalAmount") FILTER (
              WHERE "transactionType" = ${TransactionType.INCOME}::"TransactionType"
                AND "status" = ${TransactionStatus.CONFIRMED}::"TransactionStatus"
                AND "transactionDate" >= ${startOfMonth}
            ),
            0
          )::text AS "totalThisMonth",
          COUNT(*) FILTER (
            WHERE "status" = ${TransactionStatus.NEEDS_REVIEW}::"TransactionStatus"
          )::double precision AS "receiptReviewCount",
          COUNT(*) FILTER (
            WHERE "transactionType" = ${TransactionType.INCOME}::"TransactionType"
              AND "status" = ${TransactionStatus.CONFIRMED}::"TransactionStatus"
          )::double precision AS "confirmedCount",
          COUNT(*) FILTER (
            WHERE "status" = ${TransactionStatus.PENDING_CONFIRMATION}::"TransactionStatus"
          )::double precision AS "pendingTransactionCount"
        FROM "transactions"
        WHERE "businessId" = ${business.id}
      ),
      conversation_stats AS (
        SELECT
          COUNT(*) FILTER (
            WHERE "status" = ${ConversationStatus.HUMAN_NEEDED}::"ConversationStatus"
          )::double precision AS "humanNeededCount",
          COUNT(*) FILTER (
            WHERE "conversationType" = ${ConversationType.CUSTOMER_SERVICE}::"ConversationType"
          )::double precision AS "customerConversationCount",
          COUNT(*) FILTER (
            WHERE "conversationType" = ${ConversationType.CUSTOMER_SERVICE}::"ConversationType"
              AND "unreadCount" > 0
          )::double precision AS "unreadConversationCount"
        FROM "whatsapp_conversations"
        WHERE "businessId" = ${business.id}
      ),
      lead_stats AS (
        SELECT
          COUNT(*) FILTER (
            WHERE "status" = ${LeadStatus.NEW}::"LeadStatus"
          )::double precision AS "newLeadCount",
          COUNT(*) FILTER (
            WHERE "qualificationScore" >= 70
              AND "status" NOT IN (
                ${LeadStatus.WON}::"LeadStatus",
                ${LeadStatus.LOST}::"LeadStatus",
                ${LeadStatus.CLOSED}::"LeadStatus",
                ${LeadStatus.SPAM}::"LeadStatus"
              )
          )::double precision AS "hotLeadCount",
          COUNT(*) FILTER (
            WHERE "nextFollowUpAt" <= ${followUpDueAt}
              AND "status" NOT IN (
                ${LeadStatus.WON}::"LeadStatus",
                ${LeadStatus.LOST}::"LeadStatus",
                ${LeadStatus.CLOSED}::"LeadStatus",
                ${LeadStatus.SPAM}::"LeadStatus"
              )
          )::double precision AS "dueFollowUpCount"
        FROM "leads"
        WHERE "businessId" = ${business.id}
      )
      SELECT *
      FROM transaction_stats
      CROSS JOIN conversation_stats
      CROSS JOIN lead_stats
    `),
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
  const aggregate = aggregateRows[0];

  if (!aggregate) {
    throw new Error("Dashboard aggregate query returned no result.");
  }

  return {
    businessName: business.businessName,
    onboardingCompleted: business.onboardingCompleted,
    totalThisMonth: Number(aggregate.totalThisMonth),
    receiptReviewCount: aggregate.receiptReviewCount,
    confirmedCount: aggregate.confirmedCount,
    humanNeededCount: aggregate.humanNeededCount,
    customerConversationCount: aggregate.customerConversationCount,
    pendingTransactionCount: aggregate.pendingTransactionCount,
    newLeadCount: aggregate.newLeadCount,
    unreadConversationCount: aggregate.unreadConversationCount,
    hotLeadCount: aggregate.hotLeadCount,
    dueFollowUpCount: aggregate.dueFollowUpCount,
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
