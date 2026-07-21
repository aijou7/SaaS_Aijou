import { ConversationType, SenderType } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { invalidateTtlCache } from "@/lib/ttl-cache";
import {
  buildActivationReadiness,
  isAgentConfigurationComplete,
  isBusinessProfileComplete,
} from "@/server/business/activation-readiness";
import { getWhatsAppReadinessForBusiness } from "@/server/whatsapp/settings";
import { getTelegramReadinessForBusiness } from "@/server/telegram/settings";
import { normalizeWebOrigin } from "@/server/web/widget-security";
import { activationTypes, recordActivationEvent } from "@/server/activation";

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

type AgentReadinessOverride = {
  agentName: string;
  handoffRules: string | null;
  systemInstruction: string | null;
  isActive: boolean;
};

export class OnboardingReadinessError extends Error {
  constructor(readonly missingChecks: string[]) {
    super("Onboarding belum dapat diselesaikan karena masih ada readiness yang belum terpenuhi.");
    this.name = "OnboardingReadinessError";
  }
}

export async function getBusinessProfilePage(userId: string) {
  return loadBusinessReadiness(userId);
}

export async function getBusinessActivationReadiness(
  userId: string,
  agentOverride?: AgentReadinessOverride,
) {
  return (await loadBusinessReadiness(userId, agentOverride)).readiness;
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

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      businessName,
      businessType: cleanOptional(input.businessType, 120),
      whatsappNumber: cleanOptional(input.whatsappNumber, 40),
      serviceArea: cleanOptional(input.serviceArea, 500),
      operatingHours: cleanOptional(input.operatingHours, 500),
      mainServices: cleanOptional(input.mainServices, 5_000),
      websiteUrl,
      widgetAllowedOrigin: websiteUrl,
      ...(business.websiteUrl === websiteUrl ? {} : { widgetLastSeenAt: null }),
      address: cleanOptional(input.address, 1_000),
    },
  });
  if (isBusinessProfileComplete(updated)) {
    await recordActivationEvent(business.id, activationTypes.profileCompleted);
  }
  return updated;
}

export async function completeOnboarding(userId: string) {
  const { business, readiness } = await loadBusinessReadiness(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }
  if (!readiness.readyToComplete) {
    throw new OnboardingReadinessError(
      readiness.missingBeforeCompletion.map((check) => check.label),
    );
  }

  const completed = await prisma.business.update({
    where: { id: business.id },
    data: { onboardingCompleted: true },
  });
  await recordActivationEvent(business.id, "ONBOARDING_COMPLETED");
  return completed;
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
      widgetAllowedOrigin: true,
      widgetLastSeenAt: true,
      widgetKey: true,
      address: true,
      onboardingCompleted: true,
    },
  });
}

async function loadBusinessReadiness(
  userId: string,
  agentOverride?: AgentReadinessOverride,
) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      readiness: buildActivationReadiness({
        businessProfileComplete: false,
        agentConfigured: false,
        agentActive: false,
        activeKnowledgeCount: 0,
        simulatorTested: false,
        groqConfigured: Boolean(process.env.GROQ_API_KEY),
        channels: {
          webConfigured: false,
          webDetected: false,
          telegram: false,
          whatsapp: false,
        },
      }),
    };
  }

  const agentSettingsPromise = agentOverride
    ? Promise.resolve(agentOverride)
    : prisma.agentSettings.findUnique({
        where: { businessId: business.id },
        select: {
          isActive: true,
          agentName: true,
          handoffRules: true,
          systemInstruction: true,
        },
      });
  // Two bounded waves keep this shared readiness loader from exhausting the
  // five-connection serverless pool during a slow database wake-up.
  const [activeKnowledgeCount, agentSettings, whatsAppReadiness] = await Promise.all([
    prisma.knowledgeBase.count({
      where: { businessId: business.id, isActive: true },
    }),
    agentSettingsPromise,
    getWhatsAppReadinessForBusiness(business.id),
  ]);
  const [telegramReadiness, simulatorMessage, detectedWebConversation] = await Promise.all([
    getTelegramReadinessForBusiness(business.id),
    prisma.whatsAppMessage.findFirst({
      where: {
        providerMessageId: { startsWith: "sim-" },
        senderType: SenderType.CUSTOMER,
        conversation: {
          businessId: business.id,
          conversationType: ConversationType.CUSTOMER_SERVICE,
        },
      },
      select: { id: true },
    }),
    prisma.whatsAppConversation.findFirst({
      where: {
        businessId: business.id,
        channel: "WEB_CHAT",
        messages: { some: { senderType: SenderType.CUSTOMER } },
      },
      orderBy: { lastMessageAt: "desc" },
      select: { id: true, lastMessageAt: true, createdAt: true },
    }),
  ]);
  const webConfigured = Boolean(business.widgetAllowedOrigin || business.websiteUrl);
  // Loading the script proves installation, but only a persisted customer
  // message proves the channel works end-to-end and may unlock activation.
  const webDetected = webConfigured && Boolean(detectedWebConversation);

  return {
    business,
    readiness: buildActivationReadiness({
      businessProfileComplete: isBusinessProfileComplete(business),
      agentConfigured: isAgentConfigurationComplete(agentSettings),
      agentActive: Boolean(agentSettings?.isActive),
      activeKnowledgeCount,
      simulatorTested: Boolean(simulatorMessage),
      groqConfigured: Boolean(process.env.GROQ_API_KEY),
      channels: {
        webConfigured,
        webDetected,
        telegram: telegramReadiness.ready,
        whatsapp: whatsAppReadiness.ready,
      },
    }),
  };
}

function cleanOptional(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim().slice(0, maxLength);
  return trimmed ? trimmed : null;
}
