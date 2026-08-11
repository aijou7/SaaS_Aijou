export type BillingCycle = "monthly" | "annual";

export type SubscriptionPlan = {
  id: "starter" | "growth" | "business";
  name: string;
  description: string;
  monthlyPrice: number;
  trialDays: number;
  recommended?: boolean;
  features: string[];
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
    recommended: true,
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
