export type BillingCycle = "monthly" | "annual";
export type PublicPlanId = "starter" | "growth" | "business";
export type StoredPlanId = "BETA" | "STARTER" | "GROWTH" | "BUSINESS";
export type StoredBillingCycle = "MONTHLY" | "ANNUAL";

export type SubscriptionFeature =
  | "CORE_INBOX"
  | "WEB_CHAT"
  | "TELEGRAM"
  | "WHATSAPP"
  | "KNOWLEDGE"
  | "HUMAN_TAKEOVER"
  | "BASIC_REPORTS"
  | "BROADCAST"
  | "CUSTOMER_SEGMENTS"
  | "WORKFLOWS"
  | "ORDERS"
  | "COMPLAINTS"
  | "ADVANCED_REPORTS"
  | "API_WEBHOOKS"
  | "PRIORITY_SUPPORT";

export type SubscriptionPlan = {
  id: PublicPlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  trialDays: number;
  recommended?: boolean;
  features: string[];
  seatLimit: number;
  monthlyAiCredits: number;
  entitlements: SubscriptionFeature[];
};

export const ANNUAL_BILLING_MONTHS = 10;
export const ANNUAL_ACCESS_MONTHS = 12;

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "starter",
    name: "Starter",
    description: "Untuk bisnis yang mulai merapikan layanan pelanggan.",
    monthlyPrice: 299_000,
    trialDays: 30,
    seatLimit: 2,
    monthlyAiCredits: 3_000,
    entitlements: [
      "CORE_INBOX",
      "WEB_CHAT",
      "TELEGRAM",
      "WHATSAPP",
      "KNOWLEDGE",
      "HUMAN_TAKEOVER",
      "BASIC_REPORTS",
    ],
    features: [
      "1 workspace dan 2 anggota tim",
      "WhatsApp, Web Chat, dan Telegram",
      "3.000 kredit AI per bulan",
      "Knowledge bisnis dan human takeover",
      "Laporan percakapan dasar",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "Untuk tim yang mulai menangani lebih banyak lead dan proses.",
    monthlyPrice: 699_000,
    trialDays: 30,
    seatLimit: 5,
    monthlyAiCredits: 15_000,
    recommended: true,
    entitlements: [
      "CORE_INBOX",
      "WEB_CHAT",
      "TELEGRAM",
      "WHATSAPP",
      "KNOWLEDGE",
      "HUMAN_TAKEOVER",
      "BASIC_REPORTS",
      "BROADCAST",
      "CUSTOMER_SEGMENTS",
      "WORKFLOWS",
      "ORDERS",
      "COMPLAINTS",
      "ADVANCED_REPORTS",
    ],
    features: [
      "Semua fitur Starter",
      "5 anggota tim",
      "15.000 kredit AI per bulan",
      "Broadcast dan segmentasi pelanggan",
      "Workflow, order, dan komplain",
      "Laporan operasional lengkap",
    ],
  },
  {
    id: "business",
    name: "Business",
    description: "Untuk operasional besar yang memerlukan kapasitas dan pendampingan.",
    monthlyPrice: 1_499_000,
    trialDays: 0,
    seatLimit: 10,
    monthlyAiCredits: 60_000,
    entitlements: [
      "CORE_INBOX",
      "WEB_CHAT",
      "TELEGRAM",
      "WHATSAPP",
      "KNOWLEDGE",
      "HUMAN_TAKEOVER",
      "BASIC_REPORTS",
      "BROADCAST",
      "CUSTOMER_SEGMENTS",
      "WORKFLOWS",
      "ORDERS",
      "COMPLAINTS",
      "ADVANCED_REPORTS",
      "API_WEBHOOKS",
      "PRIORITY_SUPPORT",
    ],
    features: [
      "Semua fitur Growth",
      "10 anggota tim",
      "60.000 kredit AI per bulan",
      "API dan webhook",
      "Prioritas proses",
      "Onboarding dibantu tim Aijou",
    ],
  },
];

export function getAnnualPrice(monthlyPrice: number) {
  return monthlyPrice * ANNUAL_BILLING_MONTHS;
}

export function getAnnualSavings(monthlyPrice: number) {
  return monthlyPrice * (ANNUAL_ACCESS_MONTHS - ANNUAL_BILLING_MONTHS);
}

export function getAnnualMonthlyEquivalent(monthlyPrice: number) {
  return Math.round(getAnnualPrice(monthlyPrice) / ANNUAL_ACCESS_MONTHS);
}

export function getSubscriptionPlan(planId: string | null | undefined) {
  return subscriptionPlans.find((plan) => plan.id === planId) ?? null;
}

export function normalizePublicPlanId(value: string | null | undefined): PublicPlanId {
  return getSubscriptionPlan(value?.trim().toLowerCase())?.id ?? "starter";
}

export function normalizeBillingCycle(value: string | null | undefined): BillingCycle {
  return value?.trim().toLowerCase() === "annual" ? "annual" : "monthly";
}

export function toStoredPlanId(plan: PublicPlanId): Exclude<StoredPlanId, "BETA"> {
  return plan.toUpperCase() as Exclude<StoredPlanId, "BETA">;
}

export function toStoredBillingCycle(cycle: BillingCycle): StoredBillingCycle {
  return cycle.toUpperCase() as StoredBillingCycle;
}

export function toPublicPlanId(plan: StoredPlanId): PublicPlanId | null {
  return plan === "BETA" ? null : (plan.toLowerCase() as PublicPlanId);
}

export function getPlanPrice(plan: PublicPlanId, billingCycle: BillingCycle) {
  const definition = getSubscriptionPlan(plan);
  if (!definition) throw new Error("Paket langganan tidak valid.");
  return billingCycle === "annual"
    ? getAnnualPrice(definition.monthlyPrice)
    : definition.monthlyPrice;
}

export function formatIdr(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
