import { prisma } from "@/lib/prisma";
import { invalidateTtlCache, ttlCache } from "@/lib/ttl-cache";

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

type AgentSettingsInput = AgentRuntimeSettings;

export async function getAgentSettingsPage(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      settings: defaultAgentSettings(),
    };
  }

  const settings = await ensureAgentSettings(business.id);

  return {
    business,
    settings,
  };
}

export async function getAgentRuntimeSettings(businessId: string) {
  return ttlCache(`agent-runtime:${businessId}`, 30_000, () => ensureAgentSettings(businessId));
}

export async function updateAgentSettings(userId: string, input: AgentSettingsInput) {
  const business = await requireBusinessForUser(userId);
  invalidateTtlCache(`agent-runtime:${business.id}`);

  return prisma.agentSettings.upsert({
    where: { businessId: business.id },
    update: input,
    create: {
      businessId: business.id,
      ...input,
    },
  });
}

export function parseAgentSettingsFormData(formData: FormData): AgentSettingsInput {
  const agentName = String(formData.get("agentName") ?? "").trim();

  if (!agentName) {
    throw new Error("Agent name wajib diisi.");
  }

  return {
    agentName,
    tone: String(formData.get("tone") ?? "friendly").trim() || "friendly",
    language: String(formData.get("language") ?? "id").trim() || "id",
    openingMessage: cleanOptional(String(formData.get("openingMessage") ?? "")),
    closingMessage: cleanOptional(String(formData.get("closingMessage") ?? "")),
    businessDescription: cleanOptional(String(formData.get("businessDescription") ?? "")),
    handoffRules: cleanOptional(String(formData.get("handoffRules") ?? "")),
    systemInstruction: cleanOptional(String(formData.get("systemInstruction") ?? "")),
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

  return prisma.agentSettings.create({
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
  return {
    agentName: "Aijou",
    tone: "friendly, helpful, concise",
    language: "id",
    openingMessage: null,
    closingMessage: null,
    businessDescription:
      "Aijou Teknologi Digital membantu bisnis membangun website, software, automation, AI agent, dan infrastruktur jaringan yang stabil.",
    handoffRules:
      "Handoff jika customer meminta manusia/admin, meminta harga final, komplain, marah, atau kebutuhan terlalu teknis.",
    systemInstruction:
      "Kumpulkan kebutuhan customer secara natural. Jangan memberi harga final. Minta lokasi, scope, jumlah perangkat/titik, urgency, dan budget jika relevan. Untuk project besar, arahkan ke discovery atau survey.",
    isActive: true,
  };
}

function cleanOptional(value: string) {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}
