import { callGroqText } from "@/server/ai/groq";
import type { AgentRuntimeSettings } from "@/server/agent/settings";

export async function buildCustomerServiceReplyAi(params: {
  message: string;
  knowledgeContext: string;
  settings: AgentRuntimeSettings;
}) {
  const { message, knowledgeContext, settings } = params;
  const fallback = buildCustomerServiceReplyFallback(message);

  if (isHandoffRequest(message)) {
    return `${settings.agentName}: Baik, saya panggilkan owner/admin untuk lanjut bantu ya.`;
  }

  const result = await callGroqText({
    fallback,
    system: [
      `You are ${settings.agentName}, an AI customer-service agent for ${settings.businessDescription ?? "a business"}.`,
      `Language: ${settings.language}.`,
      `Tone: ${settings.tone}.`,
      "Your job is to gather lead requirements: name, location, service need, number of points/devices, urgency, budget if available, and follow-up contact.",
      "Do not provide final prices or guarantees.",
      "If asked for a final price, explain that owner needs details first and ask clarifying questions.",
      "If the customer asks for human/admin/owner, say you will hand off to the owner.",
      "Do not claim services, prices, timelines, or guarantees that are not supported by the business context below.",
      settings.businessDescription ? `Business description: ${settings.businessDescription}` : "",
      settings.handoffRules ? `Handoff rules: ${settings.handoffRules}` : "",
      settings.systemInstruction ? `Additional instruction: ${settings.systemInstruction}` : "",
      settings.openingMessage ? `Preferred opening: ${settings.openingMessage}` : "",
      settings.closingMessage ? `Preferred closing: ${settings.closingMessage}` : "",
      "Use this knowledge base as your only business-specific source:",
      knowledgeContext,
      "Keep response under 80 words.",
    ]
      .filter(Boolean)
      .join("\n"),
    user: message,
  });

  return result.text;
}

export function isHandoffRequest(message: string) {
  return /(admin|owner|manusia|orang|cs|bicara|telepon|hubungi)/i.test(message);
}

export function inferCustomerIntent(message: string) {
  const normalized = message.toLowerCase();

  if (isHandoffRequest(message)) {
    return "handoff_request";
  }

  if (/(harga|biaya|budget|quotation|penawaran)/.test(normalized)) {
    return "pricing_inquiry";
  }

  if (/(lan|jaringan|wifi|router|server|cctv|komputer)/.test(normalized)) {
    return "service_inquiry";
  }

  return "customer_message";
}

function buildCustomerServiceReplyFallback(message: string) {
  const normalized = message.toLowerCase();

  if (/(harga|biaya|budget|quotation|penawaran)/.test(normalized)) {
    return "Untuk estimasi awal bisa saya bantu kumpulkan kebutuhannya dulu. Boleh info lokasi, jenis layanan, jumlah titik/perangkat, dan target waktunya?";
  }

  return "Halo, bisa saya bantu. Boleh ceritakan kebutuhan, target yang ingin dicapai, dan perkiraan waktunya?";
}
