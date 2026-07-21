import { prisma } from "@/lib/prisma";
import { invalidateTtlCache, ttlCache } from "@/lib/ttl-cache";
import { newWorkspaceAgentDefaults } from "@/server/agent/defaults";
import { getBusinessActivationReadiness } from "@/server/business/profile";

export type AgentRuntimeSettings = {
  agentName: string;
  tone: string;
  language: string;
  openingMessage: string | null;
  closingMessage: string | null;
  businessDescription: string | null;
  handoffRules: string | null;
  systemInstruction: string | null;
  isActive: boolean;
};

export class AgentActivationError extends Error {
  constructor(readonly missingChecks: string[]) {
    super("Lengkapi readiness sebelum mengaktifkan auto-reply Aijou.");
    this.name = "AgentActivationError";
  }
}

type AgentSettingsInput = AgentRuntimeSettings;

export async function getAgentSettingsPage(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      settings: defaultAgentSettings(),
    };
  }

  const settings =
    (await prisma.agentSettings.findUnique({
      where: { businessId: business.id },
      select: {
        agentName: true,
        tone: true,
        language: true,
        openingMessage: true,
        closingMessage: true,
        businessDescription: true,
        handoffRules: true,
        systemInstruction: true,
        isActive: true,
      },
    })) ?? defaultAgentSettings();

  return {
    business,
    settings,
  };
}

export async function getAgentRuntimeSettings(businessId: string) {
  return ttlCache(`agent-runtime:${businessId}`, 30_000, async () => {
    const [settings, business] = await Promise.all([
      ensureAgentSettings(businessId),
      prisma.business.findUnique({
        where: { id: businessId },
        select: {
          businessName: true,
          businessType: true,
          mainServices: true,
          serviceArea: true,
          operatingHours: true,
          address: true,
          websiteUrl: true,
        },
      }),
    ]);

    return {
      ...settings,
      businessDescription: joinContext(
        settings.businessDescription,
        buildProfileDescription(business),
      ),
    };
  });
}

export async function updateAgentSettings(userId: string, input: AgentSettingsInput) {
  const business = await requireBusinessForUser(userId);
  const existing = await prisma.agentSettings.findUnique({
    where: { businessId: business.id },
    select: { isActive: true },
  });
  if (input.isActive && !existing?.isActive) {
    const readiness = await getBusinessActivationReadiness(userId, input);
    if (!readiness.canActivateAgent) {
      throw new AgentActivationError(
        readiness.missingBeforeActivation.map((check) => check.label),
      );
    }
  }
  const settings = await prisma.agentSettings.upsert({
    where: { businessId: business.id },
    update: input,
    create: {
      businessId: business.id,
      ...input,
    },
  });
  invalidateTtlCache(`agent-runtime:${business.id}`);
  return settings;
}

export function parseAgentSettingsFormData(formData: FormData): AgentSettingsInput {
  const agentName = String(formData.get("agentName") ?? "").trim();

  if (!agentName) {
    throw new Error("Agent name wajib diisi.");
  }
  if (agentName.length > 80) {
    throw new Error("Agent name maksimal 80 karakter.");
  }

  const languageValue = String(formData.get("language") ?? "id").trim();
  const language = languageValue === "en" ? "en" : "id";

  return {
    agentName,
    tone: cleanRequired(String(formData.get("tone") ?? "friendly"), 200, "friendly"),
    language,
    openingMessage: cleanOptional(String(formData.get("openingMessage") ?? ""), 1_000),
    closingMessage: cleanOptional(String(formData.get("closingMessage") ?? ""), 1_000),
    businessDescription: cleanOptional(
      String(formData.get("businessDescription") ?? ""),
      4_000,
    ),
    handoffRules: cleanOptional(String(formData.get("handoffRules") ?? ""), 4_000),
    systemInstruction: cleanOptional(
      String(formData.get("systemInstruction") ?? ""),
      8_000,
    ),
    isActive: formData.get("isActive") === "on",
  };
}

async function ensureAgentSettings(businessId: string) {
  const existing = await prisma.agentSettings.findUnique({
    where: { businessId },
    select: {
      agentName: true,
      tone: true,
      language: true,
      openingMessage: true,
      closingMessage: true,
      businessDescription: true,
      handoffRules: true,
      systemInstruction: true,
      isActive: true,
    },
  });

  if (existing) {
    return existing;
  }

  const created = await prisma.agentSettings.create({
    data: {
      businessId,
      ...defaultAgentSettings(),
    },
    select: {
      agentName: true,
      tone: true,
      language: true,
      openingMessage: true,
      closingMessage: true,
      businessDescription: true,
      handoffRules: true,
      systemInstruction: true,
      isActive: true,
    },
  });

  return created;
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  return business;
}

function defaultAgentSettings(): AgentRuntimeSettings {
  return newWorkspaceAgentDefaults(
    "Aijou Teknologi Digital membantu bisnis membangun website, software, automation, AI agent, dan infrastruktur jaringan yang stabil.",
  );
}

function cleanOptional(value: string, maxLength: number) {
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned ? cleaned : null;
}

function cleanRequired(value: string, maxLength: number, fallback: string) {
  return value.trim().slice(0, maxLength) || fallback;
}

function joinContext(...parts: Array<string | null | undefined>) {
  const value = parts.filter(Boolean).join("\n").trim();
  return value ? value.slice(0, 8_000) : null;
}

function buildProfileDescription(
  business: {
    businessName: string;
    businessType: string | null;
    mainServices: string | null;
    serviceArea: string | null;
    operatingHours: string | null;
    address: string | null;
    websiteUrl: string | null;
  } | null,
) {
  if (!business) return null;
  return [
    `Business: ${business.businessName}`,
    business.businessType ? `Type: ${business.businessType}` : null,
    business.mainServices ? `Services: ${business.mainServices}` : null,
    business.serviceArea ? `Service area: ${business.serviceArea}` : null,
    business.operatingHours ? `Operating hours: ${business.operatingHours}` : null,
    business.address ? `Address: ${business.address}` : null,
    business.websiteUrl ? `Website: ${business.websiteUrl}` : null,
  ].filter(Boolean).join("\n");
}
