import { Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { callGroqJson } from "@/server/ai/groq";
import { sendConversationOwnerMessage } from "@/server/conversations/conversations";

type ProposalDraftAi = {
  title: string;
  clientName: string | null;
  projectSummary: string;
  scopeOfWork: string[];
  assumptions: string[];
  exclusions: string[];
  estimatedValueMin: string | null;
  estimatedValueMax: string | null;
  timeline: string | null;
  nextSteps: string[];
  disclaimer: string;
};

const proposalStatuses = ["DRAFT", "REVIEWED", "SENT", "ACCEPTED", "REJECTED", "ARCHIVED"] as const;
type ProposalStatus = (typeof proposalStatuses)[number];

export async function generateProposalDraftFromLead(userId: string, leadId: string) {
  const business = await requireBusinessForUser(userId);
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, businessId: business.id },
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
      qualificationScore: true,
      estimatedValueMin: true,
      estimatedValueMax: true,
      estimateNote: true,
      nextStep: true,
      conversation: {
        select: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 30,
            select: {
              senderType: true,
              messageBody: true,
            },
          },
        },
      },
    },
  });

  if (!lead) {
    throw new Error("Lead tidak ditemukan.");
  }

  const transcript = lead.conversation.messages
    .filter((message) => message.messageBody)
    .map((message) => `${message.senderType}: ${message.messageBody}`)
    .join("\n");
  const fallback = buildFallbackProposalDraft({
    businessName: business.businessName,
    lead: {
      customerName: lead.customerName,
      customerPhone: lead.customerPhone,
      needSummary: lead.needSummary,
      serviceInterest: lead.serviceInterest,
      location: lead.location,
      budget: lead.budget,
      urgency: lead.urgency,
      estimatedValueMin: lead.estimatedValueMin?.toString() ?? null,
      estimatedValueMax: lead.estimatedValueMax?.toString() ?? null,
      estimateNote: lead.estimateNote,
      nextStep: lead.nextStep,
      qualificationScore: lead.qualificationScore,
    },
  });

  const result = await callGroqJson<ProposalDraftAi>({
    fallback,
    system: [
      "You create practical Indonesian proposal/quotation drafts for Aijou Teknologi Digital.",
      "Return only valid JSON.",
      "This is a draft, not a final legally binding quote.",
      "Do not invent exact prices, hardware models, guarantees, or timelines if not present.",
      "For physical network/site projects, emphasize survey/design validation before final quotation.",
      "Schema:",
      "{",
      '  "title": string,',
      '  "clientName": string or null,',
      '  "projectSummary": string,',
      '  "scopeOfWork": string[],',
      '  "assumptions": string[],',
      '  "exclusions": string[],',
      '  "estimatedValueMin": numeric rupiah string or null,',
      '  "estimatedValueMax": numeric rupiah string or null,',
      '  "timeline": string or null,',
      '  "nextSteps": string[],',
      '  "disclaimer": string',
      "}",
      "Keep it concise, consultative, and ready for owner review.",
    ].join("\n"),
    user: JSON.stringify({
      businessName: business.businessName,
      lead,
      transcript,
    }),
  });
  const parsed = parseProposalDraft(result.data, fallback);

  const proposal = await prisma.proposalDraft.create({
    data: {
      businessId: business.id,
      leadId: lead.id,
      title: parsed.title,
      clientName: parsed.clientName,
      projectSummary: parsed.projectSummary,
      scopeOfWork: parsed.scopeOfWork,
      assumptions: parsed.assumptions,
      exclusions: parsed.exclusions,
      estimatedValueMin: parsed.estimatedValueMin,
      estimatedValueMax: parsed.estimatedValueMax,
      timeline: parsed.timeline,
      nextSteps: parsed.nextSteps,
      disclaimer: parsed.disclaimer,
      generatedBy: result.source === "groq" ? "AI" : "FALLBACK",
      proposalNumber: createProposalNumber(lead.id),
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60_000),
    },
  });

  await prisma.aiLog.create({
    data: {
      businessId: business.id,
      conversationId: lead.conversationId,
      inputText: transcript || lead.needSummary,
      outputText: parsed.projectSummary,
      structuredOutput: toJson(parsed),
      intent: "proposal_draft",
      confidenceScore: result.source === "groq" ? "0.82" : "0.58",
      actionTaken: "proposal_draft_created",
    },
  });

  return proposal;
}

export async function updateProposalDraftContent(
  userId: string,
  proposalId: string,
  formData: FormData,
) {
  const business = await requireBusinessForUser(userId);
  const existing = await prisma.proposalDraft.findFirst({
    where: { id: proposalId, businessId: business.id },
    select: { id: true, version: true },
  });
  if (!existing) throw new Error("Proposal draft tidak ditemukan.");

  const title = cleanRequired(formData.get("title"), "Judul proposal", 200);
  const projectSummary = cleanRequired(formData.get("projectSummary"), "Ringkasan project", 5_000);
  const disclaimer = cleanRequired(formData.get("disclaimer"), "Disclaimer", 2_000);
  const min = normalizeMoney(String(formData.get("estimatedValueMin") ?? ""));
  const max = normalizeMoney(String(formData.get("estimatedValueMax") ?? ""));

  return prisma.proposalDraft.update({
    where: { id: existing.id },
    data: {
      title,
      clientName: normalizeText(formData.get("clientName")),
      projectSummary,
      scopeOfWork: parseLineList(formData.get("scopeOfWork")),
      assumptions: parseLineList(formData.get("assumptions")),
      exclusions: parseLineList(formData.get("exclusions")),
      estimatedValueMin: min,
      estimatedValueMax: max,
      timeline: normalizeText(formData.get("timeline")),
      nextSteps: parseLineList(formData.get("nextSteps")),
      disclaimer,
      validUntil: parseOptionalDate(formData.get("validUntil")),
      version: { increment: 1 },
    },
  });
}

export async function getProposalDraftForPrint(userId: string, proposalId: string) {
  const business = await requireBusinessForUser(userId);
  return prisma.proposalDraft.findFirst({
    where: { id: proposalId, businessId: business.id },
    include: {
      business: {
        select: {
          businessName: true,
          address: true,
          whatsappNumber: true,
          websiteUrl: true,
        },
      },
      lead: { select: { customerPhone: true, location: true } },
    },
  });
}

export async function updateProposalDraftStatus(userId: string, proposalId: string, status: string) {
  const business = await requireBusinessForUser(userId);
  const parsedStatus = parseProposalStatus(status);

  return prisma.proposalDraft.update({
    where: { id: proposalId, businessId: business.id },
    data: { status: parsedStatus },
  });
}

export async function deleteProposalDraft(userId: string, proposalId: string) {
  const business = await requireBusinessForUser(userId);

  return prisma.proposalDraft.update({
    where: { id: proposalId, businessId: business.id },
    data: { status: "ARCHIVED" },
  });
}

export async function sendProposalDraftFollowUp(userId: string, proposalId: string) {
  const business = await requireBusinessForUser(userId);
  const proposal = await prisma.proposalDraft.findFirst({
    where: { id: proposalId, businessId: business.id },
    select: {
      id: true,
      version: true,
      title: true,
      clientName: true,
      projectSummary: true,
      estimatedValueMin: true,
      estimatedValueMax: true,
      nextSteps: true,
      disclaimer: true,
      lead: {
        select: {
          conversationId: true,
        },
      },
    },
  });

  if (!proposal) {
    throw new Error("Proposal draft tidak ditemukan.");
  }

  const message = buildProposalFollowUpMessage({
    clientName: proposal.clientName,
    disclaimer: proposal.disclaimer,
    estimateRange: formatEstimateRange(
      proposal.estimatedValueMin?.toString() ?? null,
      proposal.estimatedValueMax?.toString() ?? null,
    ),
    nextSteps: proposal.nextSteps,
    projectSummary: proposal.projectSummary,
    title: proposal.title,
  });
  const delivery = await sendConversationOwnerMessage({
    businessId: business.id,
    conversationId: proposal.lead.conversationId,
    message,
    intent: "proposal_follow_up",
    providerMessagePrefix: "proposal-follow-up",
    idempotencyKey: `proposal-follow-up:${proposal.id}:v${proposal.version}`,
  });

  if (!delivery.accepted) {
    throw new Error("Proposal belum diterima channel tujuan dan tidak ditandai SENT.");
  }

  return prisma.proposalDraft.update({
    where: { id: proposal.id },
    data: { status: "SENT" },
  });
}

export async function getProposalDraftsForLead(userId: string, leadId: string) {
  const business = await requireBusinessForUser(userId);

  const proposals = await prisma.proposalDraft.findMany({
    where: { businessId: business.id, leadId },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      title: true,
      clientName: true,
      projectSummary: true,
      scopeOfWork: true,
      assumptions: true,
      exclusions: true,
      estimatedValueMin: true,
      estimatedValueMax: true,
      timeline: true,
      nextSteps: true,
      disclaimer: true,
      status: true,
      generatedBy: true,
      createdAt: true,
    },
  });

  return proposals.map((proposal) => ({
    ...proposal,
    estimatedValueMin: proposal.estimatedValueMin?.toString() ?? null,
    estimatedValueMax: proposal.estimatedValueMax?.toString() ?? null,
    createdAt: proposal.createdAt.toISOString(),
  }));
}

type ProposalPageFilters = {
  page?: number;
  query?: string;
  status?: string;
};

export async function getProposalDraftsPage(userId: string, filters: ProposalPageFilters = {}) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      proposals: [],
      summary: { total: 0, draft: 0 },
      pagination: { page: 1, pageSize: 10, total: 0, pageCount: 1 },
    };
  }

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = 10;
  const query = filters.query?.trim().slice(0, 120) ?? "";
  const status = proposalStatuses.includes(filters.status as ProposalStatus)
    ? (filters.status as ProposalStatus)
    : undefined;
  const where: Prisma.ProposalDraftWhereInput = {
    businessId: business.id,
    status: status ?? { not: "ARCHIVED" },
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { clientName: { contains: query, mode: "insensitive" } },
            { projectSummary: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const activeWhere: Prisma.ProposalDraftWhereInput = {
    businessId: business.id,
    status: { not: "ARCHIVED" },
  };
  const [proposals, total, activeTotal, draft] = await Promise.all([
    prisma.proposalDraft.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        leadId: true,
        title: true,
        clientName: true,
        projectSummary: true,
        scopeOfWork: true,
        assumptions: true,
        exclusions: true,
        estimatedValueMin: true,
        estimatedValueMax: true,
        timeline: true,
        nextSteps: true,
        disclaimer: true,
        status: true,
        generatedBy: true,
        proposalNumber: true,
        validUntil: true,
        version: true,
        createdAt: true,
        lead: {
          select: {
            conversationId: true,
            serviceInterest: true,
            qualificationScore: true,
          },
        },
      },
    }),
    prisma.proposalDraft.count({ where }),
    prisma.proposalDraft.count({ where: activeWhere }),
    prisma.proposalDraft.count({ where: { businessId: business.id, status: "DRAFT" } }),
  ]);

  return {
    business,
    proposals: proposals.map((proposal) => ({
      ...proposal,
      estimatedValueMin: proposal.estimatedValueMin?.toString() ?? null,
      estimatedValueMax: proposal.estimatedValueMax?.toString() ?? null,
      createdAt: proposal.createdAt.toISOString().slice(0, 10),
      validUntil: proposal.validUntil?.toISOString().slice(0, 10) ?? null,
    })),
    summary: { total: activeTotal, draft },
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

function buildFallbackProposalDraft(params: {
  businessName: string;
  lead: {
    customerName: string | null;
    customerPhone: string | null;
    needSummary: string;
    serviceInterest: string | null;
    location: string | null;
    budget: string | null;
    urgency: string | null;
    estimatedValueMin: string | null;
    estimatedValueMax: string | null;
    estimateNote: string | null;
    nextStep: string | null;
    qualificationScore: number | null;
  };
}): ProposalDraftAi {
  const lead = params.lead;
  const service = lead.serviceInterest ?? "Solusi teknologi";

  return {
    title: `Draft Proposal ${service}`,
    clientName: lead.customerName,
    projectSummary: lead.needSummary,
    scopeOfWork: inferScopeOfWork(service, lead.needSummary),
    assumptions: [
      lead.location ? `Lokasi project: ${lead.location}.` : "Lokasi dan kondisi lapangan masih perlu dikonfirmasi.",
      lead.budget ? `Customer menyebut budget/range: ${lead.budget}.` : "Budget final belum dikonfirmasi.",
      "Scope final akan disesuaikan setelah discovery/survey dan validasi kebutuhan.",
    ],
    exclusions: [
      "Harga final perangkat/material belum termasuk sebelum validasi scope.",
      "Pekerjaan tambahan di luar scope awal akan dibuatkan addendum/quotation terpisah.",
      "Garansi, SLA, dan timeline final mengikuti hasil review teknis.",
    ],
    estimatedValueMin: lead.estimatedValueMin,
    estimatedValueMax: lead.estimatedValueMax,
    timeline: lead.urgency ?? "Timeline final ditentukan setelah scope dan ketersediaan tim dikonfirmasi.",
    nextSteps: [
      lead.nextStep ?? "Jadwalkan sesi discovery untuk memetakan kebutuhan detail.",
      "Kumpulkan data pendukung seperti denah, jumlah user/titik, sistem existing, dan prioritas MVP.",
      "Owner Aijou menyiapkan quotation final setelah scope tervalidasi.",
    ],
    disclaimer:
      "Draft ini adalah estimasi awal untuk bahan diskusi, bukan penawaran final. Harga, timeline, dan scope final perlu divalidasi oleh owner Aijou setelah discovery/survey.",
  };
}

function parseProposalDraft(data: ProposalDraftAi, fallback: ProposalDraftAi): ProposalDraftAi {
  return {
    title: normalizeText(data.title) ?? fallback.title,
    clientName: normalizeText(data.clientName) ?? fallback.clientName,
    projectSummary: normalizeText(data.projectSummary) ?? fallback.projectSummary,
    scopeOfWork: normalizeStringArray(data.scopeOfWork, fallback.scopeOfWork),
    assumptions: normalizeStringArray(data.assumptions, fallback.assumptions),
    exclusions: normalizeStringArray(data.exclusions, fallback.exclusions),
    estimatedValueMin: normalizeMoney(data.estimatedValueMin) ?? fallback.estimatedValueMin,
    estimatedValueMax: normalizeMoney(data.estimatedValueMax) ?? fallback.estimatedValueMax,
    timeline: normalizeText(data.timeline) ?? fallback.timeline,
    nextSteps: normalizeStringArray(data.nextSteps, fallback.nextSteps),
    disclaimer: normalizeText(data.disclaimer) ?? fallback.disclaimer,
  };
}

function inferScopeOfWork(service: string, summary: string) {
  const text = `${service} ${summary}`.toLowerCase();

  if (/(wifi|jaringan|lan|router|access point|villa|hotel|hall)/.test(text)) {
    return [
      "Discovery kebutuhan jaringan, coverage area, jumlah user, dan kondisi existing.",
      "Rancangan awal topologi jaringan, distribusi access point, dan kebutuhan backbone.",
      "Rekomendasi perangkat dan estimasi kebutuhan instalasi setelah survey.",
      "Implementasi, konfigurasi, testing koneksi, dan dokumentasi dasar setelah quotation final disetujui.",
    ];
  }

  if (/(ai agent|chatbot|bot|automation)/.test(text)) {
    return [
      "Mapping kebutuhan percakapan, knowledge base, dan alur human takeover.",
      "Setup AI agent, prompt behavior, dan integrasi channel yang disepakati.",
      "Testing skenario percakapan dan tuning jawaban sebelum live.",
      "Dokumentasi penggunaan dashboard dan handover ke owner/tim.",
    ];
  }

  if (/(website|web|landing page|software|aplikasi|dashboard)/.test(text)) {
    return [
      "Discovery kebutuhan bisnis, user flow, halaman/modul, dan prioritas MVP.",
      "Pembuatan rancangan struktur, UI, dan implementasi fitur utama.",
      "Testing, deployment, dan setup environment produksi.",
      "Dokumentasi basic serta sesi handover setelah project selesai.",
    ];
  }

  return [
    "Discovery kebutuhan dan batasan project.",
    "Penyusunan rekomendasi solusi awal.",
    "Implementasi setelah scope dan quotation final disetujui.",
    "Testing, dokumentasi, dan handover.",
  ];
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const cleaned = value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  return cleaned.length > 0 ? cleaned.slice(0, 8) : fallback;
}

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanRequired(value: FormDataEntryValue | null, label: string, max: number) {
  const cleaned = String(value ?? "").trim().slice(0, max);
  if (!cleaned) throw new Error(`${label} wajib diisi.`);
  return cleaned;
}

function parseLineList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((item) => item.slice(0, 1_000));
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const date = new Date(`${text}T23:59:59.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("Tanggal berlaku proposal tidak valid.");
  return date;
}

function createProposalNumber(leadId: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `AJ-${date}-${leadId.slice(-6).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
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

function parseProposalStatus(status: string): ProposalStatus {
  const normalized = status.trim().toUpperCase();

  if (!proposalStatuses.includes(normalized as ProposalStatus)) {
    throw new Error("Status proposal tidak valid.");
  }

  return normalized as ProposalStatus;
}

function buildProposalFollowUpMessage(params: {
  clientName: string | null;
  disclaimer: string;
  estimateRange: string;
  nextSteps: string[];
  projectSummary: string;
  title: string;
}) {
  const greeting = params.clientName ? `Halo ${params.clientName},` : "Halo,";
  const nextSteps = params.nextSteps.slice(0, 3).map((step, index) => `${index + 1}. ${step}`).join("\n");

  return [
    greeting,
    `Saya sudah siapkan draft awal untuk ${params.title}.`,
    "",
    `Ringkasan: ${params.projectSummary}`,
    `Estimasi awal: ${params.estimateRange}`,
    "",
    "Next step yang disarankan:",
    nextSteps || "- Kita jadwalkan sesi discovery untuk validasi scope.",
    "",
    params.disclaimer,
  ].join("\n");
}

function formatEstimateRange(min: string | null, max: string | null) {
  if (!min && !max) {
    return "belum bisa ditentukan sebelum scope divalidasi";
  }

  if (min && max) {
    return `${formatRupiah(min)} - ${formatRupiah(max)}`;
  }

  return formatRupiah(min ?? max ?? "0");
}

function formatRupiah(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(numeric);
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

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
