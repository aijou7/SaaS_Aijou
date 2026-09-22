import { prisma } from "@/lib/prisma";

const optOutPhrases = new Set([
  "BERHENTI",
  "BERHENTI BERLANGGANAN",
  "STOP",
  "UNSUBSCRIBE",
]);

const optInPhrases = new Set([
  "YA PROMO",
  "SETUJU PROMO",
  "MAU PROMO",
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

export function isMarketingOptInMessage(value: string) {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
  return optInPhrases.has(normalized);
}

export async function recordMarketingOptInFromConsent(businessId: string, phoneNumber: string) {
  const result = await prisma.contact.updateMany({
    where: {
      businessId,
      phoneNumber,
      marketingConsentPendingAt: { not: null },
      marketingOptOutAt: null,
    },
    data: {
      marketingOptInAt: new Date(),
      marketingConsentPendingAt: null,
    },
  });
  return result.count === 1;
}

export async function recordMarketingOptOut(businessId: string, phoneNumber: string) {
  return prisma.contact.updateMany({
    where: { businessId, phoneNumber },
    data: { marketingOptOutAt: new Date(), marketingConsentPendingAt: null },
  });
}
