import { prisma } from "@/lib/prisma";

export async function getIntegrationWorkspaceSummary(userId: string, includeWebSetup = false) {
  if (includeWebSetup) {
    const business = await prisma.business.findUnique({
      where: { userId },
      select: {
        businessName: true,
        websiteUrl: true,
        widgetLastSeenAt: true,
        widgetKey: true,
        conversations: {
          where: {
            channel: "WEB_CHAT",
            messages: { some: { senderType: "CUSTOMER" } },
          },
          orderBy: { lastMessageAt: "desc" },
          take: 1,
          select: { lastMessageAt: true, createdAt: true },
        },
      },
    });
    const detectedConversation = business?.conversations[0];

    return {
      businessName: business?.businessName ?? null,
      websiteUrl: business?.websiteUrl ?? null,
      widgetKey: business?.widgetKey ?? null,
      webChatDetectedAt:
        business?.widgetLastSeenAt ??
        detectedConversation?.lastMessageAt ??
        detectedConversation?.createdAt ??
        null,
    };
  }

  const business = await prisma.business.findUnique({
    where: { userId },
    select: { businessName: true },
  });

  return {
    businessName: business?.businessName ?? null,
    websiteUrl: null,
    widgetKey: null,
    webChatDetectedAt: null,
  };
}
