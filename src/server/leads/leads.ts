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
  qualificationScore: number | null;
  estimatedValueMin: string | null;
  estimatedValueMax: string | null;
  estimateNote: string | null;
  nextStep: string | null;
  status: LeadStatus;
};

export async function upsertLeadSummaryFromConversation(
  conversationId: string,
  options: { source?: string } = {},
) {
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
          createdAt: true,
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
      '  "qualificationScore": number from 0 to 100 or null,',
      '  "estimatedValueMin": numeric rupiah string or null,',
      '  "estimatedValueMax": numeric rupiah string or null,',
      '  "estimateNote": short Indonesian estimate note or null,',
      '  "nextStep": short Indonesian recommended next action or null,',
      '  "status": "NEW" | "NEED_FOLLOW_UP" | "QUALIFIED" | "WON" | "LOST" | "CLOSED" | "SPAM"',
      "}",
      "Use NEED_FOLLOW_UP if the customer shows real service interest but data is incomplete.",
      "Use QUALIFIED if need, location/scope, and timing are reasonably clear.",
      "Do not invent final prices. If scope is enough, give only a broad early estimate range for planning.",
      "Score higher when need, budget, scope, urgency, and contact details are present.",
    ].join("\n"),
    user: JSON.stringify({
      customerName: conversation.contact?.displayName ?? null,
      customerPhone: conversation.contact?.phoneNumber ?? null,
      transcript,
    }),
  });
  const parsed = parseLeadSummary(result.data, fallback);
  const lastCustomerMessageAt =
    conversation.messages
      .filter((message) => message.senderType === "CUSTOMER")
      .at(-1)?.createdAt ?? null;

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
      source: normalizeLeadSource(options.source),
      qualificationScore: parsed.qualificationScore,
      estimatedValueMin: parsed.estimatedValueMin,
      estimatedValueMax: parsed.estimatedValueMax,
      estimateNote: parsed.estimateNote,
      nextStep: parsed.nextStep,
      lastCustomerMessageAt,
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
      source: normalizeLeadSource(options.source),
      qualificationScore: parsed.qualificationScore,
      estimatedValueMin: parsed.estimatedValueMin,
      estimatedValueMax: parsed.estimatedValueMax,
      estimateNote: parsed.estimateNote,
      nextStep: parsed.nextStep,
      lastCustomerMessageAt,
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

  const [leads, newCount, followUp, qualified, won, lost, webChat, brief, hot] = await Promise.all([
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
        source: true,
        qualificationScore: true,
        estimatedValueMin: true,
        estimatedValueMax: true,
        estimateNote: true,
        nextStep: true,
        lastCustomerMessageAt: true,
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
    prisma.lead.count({ where: { businessId: business.id, source: "WEB_CHAT" } }),
    prisma.lead.count({ where: { businessId: business.id, source: "BRIEF" } }),
    prisma.lead.count({ where: { businessId: business.id, qualificationScore: { gte: 70 } } }),
  ]);

  return {
    business,
    summary: { new: newCount, followUp, qualified, won, lost, webChat, brief, hot },
    leads: leads.map((lead) => ({
      ...lead,
      estimatedValueMin: lead.estimatedValueMin?.toString() ?? null,
      estimatedValueMax: lead.estimatedValueMax?.toString() ?? null,
      lastCustomerMessageAt: lead.lastCustomerMessageAt?.toISOString() ?? null,
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
  const location = extractAfterKeyword(transcript, /(lokasi|di)\s+([A-Za-z0-9 .,_-]{3,40})/i);
  const budget = extractBudget(transcript);
  const urgency = extractAfterKeyword(transcript, /(minggu ini|besok|urgent|secepatnya|bulan ini)/i);
  const serviceInterest = inferServiceInterest(lower);
  const estimate = estimateInitialValue(lower, budget);
  const score = scoreLead({
    budget,
    customerPhone: params.customerPhone,
    location,
    serviceInterest,
    transcript,
    urgency,
  });

  return {
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    needSummary: transcript.slice(0, 280),
    serviceInterest,
    location,
    budget,
    urgency,
    qualificationScore: score,
    estimatedValueMin: estimate.min,
    estimatedValueMax: estimate.max,
    estimateNote: estimate.note,
    nextStep: estimate.nextStep,
    status: inferLeadStatus(score, transcript),
  };
}

function parseLeadSummary(data: LeadSummary, fallback: LeadSummary): LeadSummary {
  const status = Object.values(LeadStatus).includes(data.status) ? data.status : fallback.status;
  const score = normalizeScore(data.qualificationScore) ?? fallback.qualificationScore;

  return {
    customerName: normalizeNullable(data.customerName) ?? fallback.customerName,
    customerPhone: normalizeNullable(data.customerPhone) ?? fallback.customerPhone,
    needSummary: normalizeNullable(data.needSummary) ?? fallback.needSummary,
    serviceInterest: normalizeNullable(data.serviceInterest) ?? fallback.serviceInterest,
    location: normalizeNullable(data.location) ?? fallback.location,
    budget: normalizeNullable(data.budget) ?? fallback.budget,
    urgency: normalizeNullable(data.urgency) ?? fallback.urgency,
    qualificationScore: score,
    estimatedValueMin: normalizeMoney(data.estimatedValueMin) ?? fallback.estimatedValueMin,
    estimatedValueMax: normalizeMoney(data.estimatedValueMax) ?? fallback.estimatedValueMax,
    estimateNote: normalizeNullable(data.estimateNote) ?? fallback.estimateNote,
    nextStep: normalizeNullable(data.nextStep) ?? fallback.nextStep,
    status: status === LeadStatus.NEW && (score ?? 0) >= 70 ? LeadStatus.QUALIFIED : status,
  };
}

function normalizeNullable(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractAfterKeyword(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return match?.[2]?.trim() ?? match?.[1]?.trim() ?? null;
}

function extractBudget(text: string) {
  const match = text.match(/(?:budget|anggaran|biaya|dana)\s*(?:nya|sekitar|kisaran|:)?\s*([A-Za-z0-9 .,_-]{3,60})/i);
  return match?.[1]?.trim() ?? null;
}

function inferServiceInterest(lower: string) {
  if (/(lan|jaringan|wifi|router|access point|mikrotik|unifi|cctv)/.test(lower)) {
    return "Instalasi jaringan/LAN/WiFi";
  }

  if (/(ai agent|chatbot|bot|whatsapp ai|automation ai)/.test(lower)) {
    return "AI agent bisnis";
  }

  if (/(automation|otomasi|workflow|integrasi|spreadsheet|operasional)/.test(lower)) {
    return "Automation bisnis";
  }

  if (/(website|landing page|company profile|web)/.test(lower)) {
    return "Website / web app";
  }

  if (/(software|aplikasi|dashboard|sistem|saas|erp|pos)/.test(lower)) {
    return "Software custom";
  }

  return "Konsultasi IT";
}

function estimateInitialValue(lower: string, budget: string | null) {
  if (/(villa|hotel|resort|gedung|area|bangunan|hall)/.test(lower) && /(wifi|jaringan|lan|router|access point)/.test(lower)) {
    return {
      min: "150000000",
      max: "350000000",
      note: "Estimasi awal project jaringan area luas. Nilai final tetap perlu survey site, desain topologi, dan pilihan perangkat.",
      nextStep: "Minta denah/site plan, jumlah pengguna, jarak antar bangunan, dan jadwalkan survey.",
    };
  }

  if (/(wifi|jaringan|lan|router|access point)/.test(lower)) {
    return {
      min: "8000000",
      max: "75000000",
      note: "Estimasi awal instalasi jaringan bergantung jumlah titik, coverage, dan perangkat yang dipilih.",
      nextStep: "Minta lokasi, jumlah titik, jumlah user, dan kondisi perangkat existing.",
    };
  }

  if (/(ai agent|chatbot|bot|whatsapp ai)/.test(lower)) {
    return {
      min: "5000000",
      max: "30000000",
      note: "Estimasi awal AI agent bergantung channel, knowledge base, handoff, dan integrasi dashboard.",
      nextStep: "Petakan channel, FAQ/knowledge, dan proses human takeover yang dibutuhkan.",
    };
  }

  if (/(automation|otomasi|workflow|integrasi)/.test(lower)) {
    return {
      min: "5000000",
      max: "50000000",
      note: "Estimasi awal automation bergantung jumlah workflow, sistem yang dihubungkan, dan approval flow.",
      nextStep: "Minta contoh proses manual saat ini dan output yang diharapkan.",
    };
  }

  if (/(website|landing page|company profile)/.test(lower)) {
    return {
      min: "3000000",
      max: "20000000",
      note: "Estimasi awal website bergantung jumlah halaman, copywriting, asset, CMS, dan integrasi.",
      nextStep: "Tentukan tujuan website, halaman utama, referensi desain, dan deadline.",
    };
  }

  if (/(software|aplikasi|dashboard|sistem|saas|erp|pos)/.test(lower)) {
    return {
      min: "15000000",
      max: "120000000",
      note: "Estimasi awal software custom bergantung scope modul, role user, data, dan integrasi.",
      nextStep: "Buat sesi discovery untuk memetakan modul, prioritas MVP, dan timeline.",
    };
  }

  if (budget) {
    return {
      min: null,
      max: null,
      note: `Customer menyebut budget ${budget}. Perlu breakdown scope sebelum dibuat estimasi yang aman.`,
      nextStep: "Klarifikasi kebutuhan utama, target waktu, dan batasan scope.",
    };
  }

  return {
    min: null,
    max: null,
    note: "Belum cukup data untuk estimasi. Kumpulkan scope, lokasi, timeline, dan budget.",
    nextStep: "Tanyakan kebutuhan utama, target waktu, budget, dan kontak follow-up.",
  };
}

function scoreLead(params: {
  budget: string | null;
  customerPhone: string | null;
  location: string | null;
  serviceInterest: string | null;
  transcript: string;
  urgency: string | null;
}) {
  let score = 20;

  if (params.serviceInterest && params.serviceInterest !== "Konsultasi IT") score += 20;
  if (params.budget) score += 20;
  if (params.location) score += 15;
  if (params.urgency) score += 15;
  if (params.customerPhone && !params.customerPhone.startsWith("web-")) score += 5;
  if (/(bangunan|user|titik|budget|deadline|villa|kantor|integrasi|dashboard)/i.test(params.transcript)) score += 10;

  return Math.min(score, 100);
}

function inferLeadStatus(score: number, transcript: string) {
  if (/(spam|test doang|abaikan)/i.test(transcript)) {
    return LeadStatus.SPAM;
  }

  if (score >= 70) {
    return LeadStatus.QUALIFIED;
  }

  if (score >= 35) {
    return LeadStatus.NEED_FOLLOW_UP;
  }

  return LeadStatus.NEW;
}

function normalizeScore(value: unknown) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeMoney(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value)).toString();
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[^\d]/g, "");
  return normalized ? normalized : null;
}

function normalizeLeadSource(value?: string) {
  const source = value?.trim().toUpperCase();
  return source && /^[A-Z0-9_-]{2,32}$/.test(source) ? source : "CHAT";
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
