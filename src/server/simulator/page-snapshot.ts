import {
  ConversationStatus,
  ConversationType,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma-beta/client";
import { prisma, withDatabaseRawReadRetry } from "@/lib/prisma";

type SimulatorMetricRow = {
  totalThisMonth: number | string;
  humanNeeded: number;
  customerService: number;
};

export async function getSimulatorPageSnapshot(userId: string) {
  const business = await prisma.business.findUnique({
    where: { userId },
    select: { id: true, businessName: true },
  });

  if (!business) {
    return {
      businessName: null,
      totalThisMonth: 0,
      summary: { humanNeeded: 0, customerService: 0 },
      conversations: [],
    };
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [metricRows, conversations] = await Promise.all([
    withDatabaseRawReadRetry(() => prisma.$queryRaw<SimulatorMetricRow[]>`
      SELECT
        COALESCE((
          SELECT SUM("totalAmount")
          FROM "transactions"
          WHERE "businessId" = ${business.id}
            AND "transactionType"::text = ${TransactionType.INCOME}
            AND "status"::text = ${TransactionStatus.CONFIRMED}
            AND "transactionDate" >= ${monthStart}
        ), 0) AS "totalThisMonth",
        (
          SELECT COUNT(*)::int
          FROM "whatsapp_conversations"
          WHERE "businessId" = ${business.id}
            AND "status"::text = ${ConversationStatus.HUMAN_NEEDED}
        ) AS "humanNeeded",
        (
          SELECT COUNT(*)::int
          FROM "whatsapp_conversations"
          WHERE "businessId" = ${business.id}
            AND "conversationType"::text = ${ConversationType.CUSTOMER_SERVICE}
        ) AS "customerService"
    `),
    prisma.whatsAppConversation.findMany({
      where: { businessId: business.id },
      orderBy: [{ lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        status: true,
        contact: { select: { displayName: true, phoneNumber: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { messageBody: true },
        },
      },
    }),
  ]);
  const metrics = metricRows[0] ?? {
    totalThisMonth: 0,
    humanNeeded: 0,
    customerService: 0,
  };

  return {
    businessName: business.businessName,
    totalThisMonth: Number(metrics.totalThisMonth),
    summary: {
      humanNeeded: metrics.humanNeeded,
      customerService: metrics.customerService,
    },
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      status: conversation.status,
      contactName:
        conversation.contact?.displayName ?? conversation.contact?.phoneNumber ?? "Unknown",
      lastMessage: conversation.messages[0]?.messageBody ?? "",
    })),
  };
}
