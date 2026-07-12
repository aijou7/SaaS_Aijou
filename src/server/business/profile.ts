import { prisma } from "@/lib/prisma";
import { invalidateTtlCache } from "@/lib/ttl-cache";
import { getWhatsAppReadinessForBusiness } from "@/server/whatsapp/settings";
import { getTelegramReadinessForBusiness } from "@/server/telegram/settings";
import { normalizeWebOrigin } from "@/server/web/widget-security";

export type BusinessProfileInput = {
  businessName: string;
  businessType?: string | null;
  whatsappNumber?: string | null;
  serviceArea?: string | null;
  operatingHours?: string | null;
  mainServices?: string | null;
  websiteUrl?: string | null;
  address?: string | null;
};

export async function getBusinessProfilePage(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      readiness: buildReadiness(null, { activeKnowledgeCount: 0, agentActive: false }),
    };
  }

  const [activeKnowledgeCount, agentSettings, whatsAppReadiness, telegramReadiness] = await Promise.all([
    prisma.knowledgeBase.count({
      where: { businessId: business.id, isActive: true },
    }),
    prisma.agentSettings.findUnique({
      where: { businessId: business.id },
      select: { isActive: true, agentName: true, handoffRules: true, systemInstruction: true },
    }),
    getWhatsAppReadinessForBusiness(business.id),
    getTelegramReadinessForBusiness(business.id),
  ]);

  return {
    business,
    readiness: buildReadiness(business, {
      activeKnowledgeCount,
      agentActive: Boolean(agentSettings?.isActive),
      agentName: agentSettings?.agentName ?? null,
      handoffRules: agentSettings?.handoffRules ?? null,
      systemInstruction: agentSettings?.systemInstruction ?? null,
      whatsAppReady: whatsAppReadiness.ready,
      telegramReady: telegramReadiness.ready,
    }),
  };
}

export async function updateBusinessProfile(userId: string, input: BusinessProfileInput) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  const businessName = input.businessName.trim().slice(0, 120);

  if (!businessName) {
    throw new Error("Nama bisnis wajib diisi.");
  }

  const websiteValue = cleanOptional(input.websiteUrl, 2_048);
  const websiteUrl = websiteValue ? normalizeWebOrigin(websiteValue) : null;

  if (websiteValue && !websiteUrl) {
    throw new Error("Website harus berupa URL HTTPS yang valid, contoh https://bisnis.com.");
  }

  invalidateTtlCache(`agent-runtime:${business.id}`);
  invalidateTtlCache("widget-business:");

  return prisma.business.update({
    where: { id: business.id },
    data: {
      businessName,
      businessType: cleanOptional(input.businessType, 120),
      whatsappNumber: cleanOptional(input.whatsappNumber, 40),
      serviceArea: cleanOptional(input.serviceArea, 500),
      operatingHours: cleanOptional(input.operatingHours, 500),
      mainServices: cleanOptional(input.mainServices, 5_000),
      websiteUrl,
      address: cleanOptional(input.address, 1_000),
    },
  });
}

export async function completeOnboarding(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  return prisma.business.update({
    where: { id: business.id },
    data: { onboardingCompleted: true },
  });
}

export function parseBusinessProfileFormData(formData: FormData): BusinessProfileInput {
  return {
    businessName: String(formData.get("businessName") ?? ""),
    businessType: String(formData.get("businessType") ?? ""),
    whatsappNumber: String(formData.get("whatsappNumber") ?? ""),
    serviceArea: String(formData.get("serviceArea") ?? ""),
    operatingHours: String(formData.get("operatingHours") ?? ""),
    mainServices: String(formData.get("mainServices") ?? ""),
    websiteUrl: String(formData.get("websiteUrl") ?? ""),
    address: String(formData.get("address") ?? ""),
  };
}

function buildReadiness(
  business: Awaited<ReturnType<typeof getBusinessForUser>>,
  params: {
    activeKnowledgeCount: number;
    agentActive: boolean;
    agentName?: string | null;
    handoffRules?: string | null;
    systemInstruction?: string | null;
    whatsAppReady?: boolean;
    telegramReady?: boolean;
  },
) {
  const checks = [
    {
      key: "business-profile",
      label: "Business profile lengkap",
      description: "Nama, jenis bisnis, layanan, area, dan jam operasional terisi.",
      done: Boolean(
        business?.businessName &&
          business.businessType &&
          business.mainServices &&
          business.serviceArea &&
          business.operatingHours,
      ),
      href: "/business",
    },
    {
      key: "agent",
      label: "Agent aktif dan punya instruksi",
      description: "Agent aktif, punya nama, system instruction, dan aturan handoff.",
      done: Boolean(
        params.agentActive && params.agentName && params.systemInstruction && params.handoffRules,
      ),
      href: "/agent",
    },
    {
      key: "knowledge",
      label: "Knowledge base aktif",
      description: "Minimal 3 knowledge item aktif supaya jawaban AI tidak kosong.",
      done: params.activeKnowledgeCount >= 3,
      href: "/knowledge",
    },
    {
      key: "groq",
      label: "Groq API connected",
      description: "GROQ_API_KEY tersedia di environment.",
      done: Boolean(process.env.GROQ_API_KEY),
      href: "/ai-activity",
    },
    {
      key: "channel",
      label: "Minimal satu channel siap",
      description: "Aktifkan web live chat, Telegram, atau WhatsApp dari dashboard.",
      done: Boolean(business?.websiteUrl || params.whatsAppReady || params.telegramReady),
      href: "/integrations",
    },
  ];

  const completed = checks.filter((check) => check.done).length;

  return {
    checks,
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    activeKnowledgeCount: params.activeKnowledgeCount,
    channels: {
      web: Boolean(business?.websiteUrl),
      telegram: Boolean(params.telegramReady),
      whatsapp: Boolean(params.whatsAppReady),
    },
  };
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      businessType: true,
      whatsappNumber: true,
      serviceArea: true,
      operatingHours: true,
      mainServices: true,
      websiteUrl: true,
      widgetKey: true,
      address: true,
      onboardingCompleted: true,
    },
  });
}

function cleanOptional(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim().slice(0, maxLength);
  return trimmed ? trimmed : null;
}
