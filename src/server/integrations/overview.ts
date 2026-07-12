import { prisma } from "@/lib/prisma";

export async function getIntegrationWorkspaceSummary(userId: string, includeWebSetup = false) {
  if (includeWebSetup) {
    const business = await prisma.business.findUnique({
      where: { userId },
      select: {
        businessName: true,
        websiteUrl: true,
        widgetKey: true,
      },
    });

    return {
      businessName: business?.businessName ?? null,
      websiteUrl: business?.websiteUrl ?? null,
      widgetKey: business?.widgetKey ?? null,
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
  };
}
