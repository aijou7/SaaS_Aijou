import { prisma, withDatabaseRawReadRetry } from "@/lib/prisma";

type UsageMetricsRow = {
  messages: number;
  conversations: number;
  aiRequests: number;
  automationRuns: number;
  paymentSessions: number;
  inputTokens: number;
  outputTokens: number;
  instrumentedAiRequests: number;
  aiFailures: number;
  averageLatencyMs: number | string;
  estimatedCostUsd: number | string;
};

export async function getUsageSnapshot(userId: string) {
  const business = await prisma.business.findUnique({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      websiteUrl: true,
      whatsAppSettings: { select: { isActive: true } },
      telegramSettings: { select: { isActive: true } },
    },
  });
  if (!business) return null;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const metricRows = await withDatabaseRawReadRetry(() => prisma.$queryRaw<UsageMetricsRow[]>`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM "whatsapp_messages" AS message
        INNER JOIN "whatsapp_conversations" AS conversation
          ON conversation.id = message."conversationId"
        WHERE conversation."businessId" = ${business.id}
          AND message."createdAt" >= ${monthStart}
      ) AS "messages",
      (
        SELECT COUNT(*)::int FROM "whatsapp_conversations"
        WHERE "businessId" = ${business.id} AND "lastMessageAt" >= ${monthStart}
      ) AS "conversations",
      (
        SELECT COUNT(*)::int FROM "ai_logs"
        WHERE "businessId" = ${business.id} AND "createdAt" >= ${monthStart}
      ) AS "aiRequests",
      (
        SELECT COUNT(*)::int FROM "background_jobs"
        WHERE "businessId" = ${business.id} AND "createdAt" >= ${monthStart}
      ) AS "automationRuns",
      (
        SELECT COUNT(*)::int FROM "payment_sessions"
        WHERE "businessId" = ${business.id} AND "createdAt" >= ${monthStart}
      ) AS "paymentSessions",
      COALESCE(SUM("inputTokens"), 0)::int AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::int AS "outputTokens",
      COALESCE(SUM("totalAiRequests"), 0)::int AS "instrumentedAiRequests",
      (COUNT(*) FILTER (WHERE "status" = 'FAILED'))::int AS "aiFailures",
      COALESCE(AVG("latencyMs"), 0) AS "averageLatencyMs",
      COALESCE(SUM("estimatedCost"), 0) AS "estimatedCostUsd"
    FROM "usage_logs"
    WHERE "businessId" = ${business.id} AND "createdAt" >= ${monthStart}
  `);
  const metrics = metricRows[0] ?? {
    messages: 0,
    conversations: 0,
    aiRequests: 0,
    automationRuns: 0,
    paymentSessions: 0,
    inputTokens: 0,
    outputTokens: 0,
    instrumentedAiRequests: 0,
    aiFailures: 0,
    averageLatencyMs: 0,
    estimatedCostUsd: 0,
  };
  const estimatedCostUsd = Number(metrics.estimatedCostUsd);
  const spendAlertUsd = Number(process.env.AI_SPEND_ALERT_USD ?? 0);

  return {
    businessName: business.businessName,
    nextResetAt: nextMonth.toISOString(),
    channels:
      Number(Boolean(business.websiteUrl)) +
      Number(Boolean(business.whatsAppSettings?.isActive)) +
      Number(Boolean(business.telegramSettings?.isActive)),
    messages: metrics.messages,
    conversations: metrics.conversations,
    aiRequests: metrics.aiRequests,
    automationRuns: metrics.automationRuns,
    paymentSessions: metrics.paymentSessions,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    instrumentedAiRequests: metrics.instrumentedAiRequests,
    aiFailures: metrics.aiFailures,
    averageLatencyMs: Math.round(Number(metrics.averageLatencyMs)),
    estimatedCostUsd,
    spendAlert: spendAlertUsd > 0 && estimatedCostUsd >= spendAlertUsd,
  };
}
