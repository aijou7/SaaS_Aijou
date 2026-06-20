import { LeadStatus, Prisma } from "@/generated/prisma/client";
import { callGroqJson } from "@/server/ai/groq";
import { prisma } from "@/lib/prisma";

type LeadSummary = {
  customerName: string | null;
  customerPhone: string | null;
  needSummary: string;
  serviceInterest: string | null;
  location: string | null;
  budget: string | null;
  urgency: string | null;
  status: LeadStatus;
};

export async function upsertLeadSummaryFromConversation(conversationId: string) {
  const conversation = await prisma.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      businessId: true,
      contact: {
        select: {
          displayName: true,
          phoneNumber: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 30,
        select: {
          senderType: true,
          messageBody: true,
        },
      },
    },
  });

  if (!conversation) {
    return null;
  }

  const transcript = conversation.messages
    .filter((message) => message.messageBody)
    .map((message) => `${message.senderType}: ${message.messageBody}`)
    .join("\n");

  if (!transcript.trim()) {
    return null;
  }

  const fallback = buildFallbackLeadSummary({
    transcript,
    customerName: conversation.contact?.displayName ?? null,
    customerPhone: conversation.contact?.phoneNumber ?? null,
  });
  const result = await callGroqJson<LeadSummary>({
    fallback,
    system: [
      "You summarize WhatsApp customer-service conversations into sales leads.",
      "Return only valid JSON.",
      "Schema:",
      "{",
      '  "customerName": string or null,',
      '  "customerPhone": string or null,',
      '  "needSummary": string,',
      '  "serviceInterest": string or null,',
      '  "location": string or null,',
      '  "budget": string or null,',
      '  "urgency": string or null,',
      '  "status": "NEW" | "NEED_FOLLOW_UP" | "QUALIFIED" | "WON" | "LOST" | "CLOSED" | "SPAM"',
      "}",
      "Use NEED_FOLLOW_UP if the customer shows real service interest but data is incomplete.",
      "Use QUALIFIED if need, location/scope, and timing are reasonably clear.",
    ].join("\n"),
    user: JSON.stringify({
      customerName: conversation.contact?.displayName ?? null,
      customerPhone: conversation.contact?.phoneNumber ?? null,
      transcript,
    }),
  });
  const parsed = parseLeadSummary(result.data, fallback);

  const lead = await prisma.lead.upsert({
    where: {
      businessId_conversationId: {
        businessId: conversation.businessId,
        conversationId,
      },
    },
    update: {
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      needSummary: parsed.needSummary,
      serviceInterest: parsed.serviceInterest,
      location: parsed.location,
      budget: parsed.budget,
      urgency: parsed.urgency,
      status: parsed.status,
      extractedJson: toJson(parsed),
    },
    create: {
      businessId: conversation.businessId,
      conversationId,
      customerName: parsed.customerName,
      customerPhone: parsed.customerPhone,
      needSummary: parsed.needSummary,
      serviceInterest: parsed.serviceInterest,
      location: parsed.location,
      budget: parsed.budget,
      urgency: parsed.urgency,
      status: parsed.status,
      extractedJson: toJson(parsed),
    },
  });

  await prisma.aiLog.create({
    data: {
      businessId: conversation.businessId,
      conversationId,
      inputText: transcript,
      outputText: parsed.needSummary,
      structuredOutput: toJson(parsed),
      intent: "lead_summary",
      confidenceScore: result.source === "groq" ? "0.84" : "0.62",
      actionTaken: "lead_summary_upserted",
    },
  });

  return lead;
}

export async function getLeadsPage(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true },
  });

  if (!business) {
    return {
      business: null,
      leads: [],
      summary: {
        new: 0,
        followUp: 0,
        qualified: 0,
        won: 0,
        lost: 0,
      },
    };
  }

  const [leads, newCount, followUp, qualified, won, lost] = await Promise.all([
    prisma.lead.findMany({
      where: { businessId: business.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        conversationId: true,
        customerName: true,
        customerPhone: true,
        needSummary: true,
        serviceInterest: true,
        location: true,
        budget: true,
        urgency: true,
        status: true,
        ownerNotes: true,
        updatedAt: true,
      },
    }),
    prisma.lead.count({ where: { businessId: business.id, status: LeadStatus.NEW } }),
    prisma.lead.count({ where: { businessId: business.id, status: LeadStatus.NEED_FOLLOW_UP } }),
    prisma.lead.count({ where: { businessId: business.id, status: LeadStatus.QUALIFIED } }),
    prisma.lead.count({ where: { businessId: business.id, status: LeadStatus.WON } }),
    prisma.lead.count({ where: { businessId: business.id, status: LeadStatus.LOST } }),
  ]);

  return {
    business,
    summary: { new: newCount, followUp, qualified, won, lost },
    leads: leads.map((lead) => ({
      ...lead,
      updatedAt: lead.updatedAt.toISOString().slice(0, 10),
    })),
  };
}

export async function updateLead(userId: string, leadId: string, formData: FormData) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (!business) {
    throw new Error("Business belum dibuat.");
  }

  const status = String(formData.get("status") ?? LeadStatus.NEW);
  const ownerNotes = String(formData.get("ownerNotes") ?? "");

  if (!Object.values(LeadStatus).includes(status as LeadStatus)) {
    throw new Error("Lead status tidak valid.");
  }

  return prisma.lead.update({
    where: { id: leadId, businessId: business.id },
    data: {
      status: status as LeadStatus,
      ownerNotes: ownerNotes.trim() || null,
    },
  });
}

function buildFallbackLeadSummary(params: {
  transcript: string;
  customerName: string | null;
  customerPhone: string | null;
}): LeadSummary {
  const transcript = params.transcript;
  const lower = transcript.toLowerCase();

  return {
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    needSummary: transcript.slice(0, 280),
    serviceInterest: /(lan|jaringan|wifi|router)/.test(lower)
      ? "Instalasi jaringan/LAN/WiFi"
      : "Konsultasi IT",
    location: extractAfterKeyword(transcript, /(lokasi|di)\s+([A-Za-z0-9 .,_-]{3,40})/i),
    budget: extractAfterKeyword(transcript, /(budget|anggaran|biaya)\s+([A-Za-z0-9 .,_-]{3,40})/i),
    urgency: extractAfterKeyword(transcript, /(minggu ini|besok|urgent|secepatnya|bulan ini)/i),
    status: LeadStatus.NEED_FOLLOW_UP,
  };
}

function parseLeadSummary(data: LeadSummary, fallback: LeadSummary): LeadSummary {
  const status = Object.values(LeadStatus).includes(data.status) ? data.status : fallback.status;

  return {
    customerName: normalizeNullable(data.customerName) ?? fallback.customerName,
    customerPhone: normalizeNullable(data.customerPhone) ?? fallback.customerPhone,
    needSummary: normalizeNullable(data.needSummary) ?? fallback.needSummary,
    serviceInterest: normalizeNullable(data.serviceInterest) ?? fallback.serviceInterest,
    location: normalizeNullable(data.location) ?? fallback.location,
    budget: normalizeNullable(data.budget) ?? fallback.budget,
    urgency: normalizeNullable(data.urgency) ?? fallback.urgency,
    status,
  };
}

function normalizeNullable(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractAfterKeyword(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[2]?.trim() ?? match?.[1]?.trim() ?? null;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
