import { prisma } from "@/lib/prisma";

const optOutPhrases = new Set([
  "BERHENTI",
  "BERHENTI BERLANGGANAN",
  "STOP",
  "UNSUBSCRIBE",
]);

export function isMarketingOptOutMessage(value: string) {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  return optOutPhrases.has(normalized);
}

export async function recordMarketingOptOut(businessId: string, phoneNumber: string) {
  return prisma.contact.updateMany({
    where: { businessId, phoneNumber },
    data: { marketingOptOutAt: new Date() },
  });
}
