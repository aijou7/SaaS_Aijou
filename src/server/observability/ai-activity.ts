import { prisma } from "@/lib/prisma";

export async function getAiActivityPage(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true },
  });

  if (!business) {
    return {
      business: null,
      summary: {
        totalLogs: 0,
        lowConfidence: 0,
        handoffRelated: 0,
      },
      logs: [],
    };
  }

  const [logs, totalLogs, lowConfidence, handoffRelated] = await Promise.all([
    prisma.aiLog.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        inputText: true,
        outputText: true,
        structuredOutput: true,
        intent: true,
        confidenceScore: true,
        actionTaken: true,
        createdAt: true,
        conversation: {
          select: {
            id: true,
            status: true,
            contact: {
              select: {
                displayName: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    }),
    prisma.aiLog.count({ where: { businessId: business.id } }),
    prisma.aiLog.count({
      where: {
        businessId: business.id,
        confidenceScore: {
          lt: "0.7",
        },
      },
    }),
    prisma.aiLog.count({
      where: {
        businessId: business.id,
        OR: [
          { actionTaken: { contains: "handoff", mode: "insensitive" } },
          { actionTaken: { contains: "takeover", mode: "insensitive" } },
          { intent: { contains: "handoff", mode: "insensitive" } },
        ],
      },
    }),
  ]);

  return {
    business,
    summary: {
      totalLogs,
      lowConfidence,
      handoffRelated,
    },
    logs: logs.map((log) => ({
      id: log.id,
      inputText: log.inputText ?? "",
      outputText: log.outputText ?? "",
      structuredOutput: log.structuredOutput,
      intent: log.intent ?? "-",
      confidenceScore: log.confidenceScore === null ? null : Number(log.confidenceScore),
      actionTaken: log.actionTaken ?? "-",
      createdAt: log.createdAt.toISOString(),
      conversationId: log.conversation?.id ?? null,
      conversationStatus: log.conversation?.status ?? null,
      contactName:
        log.conversation?.contact?.displayName ??
        log.conversation?.contact?.phoneNumber ??
        "No conversation",
    })),
  };
}

export function formatConfidence(score: number | null) {
  if (score === null) {
    return "-";
  }

  return `${Math.round(score * 100)}%`;
}
