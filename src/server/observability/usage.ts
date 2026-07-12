import { prisma } from "@/lib/prisma";

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
  const [messages, conversations, aiRequests, automationRuns, paymentSessions] = await Promise.all([
    prisma.whatsAppMessage.count({
      where: {
        createdAt: { gte: monthStart },
        conversation: { businessId: business.id },
      },
    }),
    prisma.whatsAppConversation.count({
      where: { businessId: business.id, lastMessageAt: { gte: monthStart } },
    }),
    prisma.aiLog.count({
      where: { businessId: business.id, createdAt: { gte: monthStart } },
    }),
    prisma.backgroundJob.count({
      where: { businessId: business.id, createdAt: { gte: monthStart } },
    }),
    prisma.paymentSession.count({
      where: { businessId: business.id, createdAt: { gte: monthStart } },
    }),
  ]);

  return {
    businessName: business.businessName,
    nextResetAt: nextMonth.toISOString(),
    channels:
      Number(Boolean(business.websiteUrl)) +
      Number(Boolean(business.whatsAppSettings?.isActive)) +
      Number(Boolean(business.telegramSettings?.isActive)),
    messages,
    conversations,
    aiRequests,
    automationRuns,
    paymentSessions,
  };
}
