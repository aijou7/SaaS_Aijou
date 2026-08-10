import {
  KnowledgeReviewStatus,
  KnowledgeSourceType,
  Prisma,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  buildKnowledgePromptContext,
  normalizeKnowledgeTextInput,
} from "@/lib/knowledge-limits";
import { rankRelevantKnowledge } from "@/lib/knowledge-retrieval";
import { invalidateTtlCache, ttlCache } from "@/lib/ttl-cache";
import { callGroqJson } from "@/server/ai/groq";

export type KnowledgeBaseInput = {
  title: string;
  content: string;
  category?: string;
  isActive?: boolean;
  sourceType?: KnowledgeSourceType;
  reviewStatus?: KnowledgeReviewStatus;
  sourceUrl?: string | null;
  sourceName?: string | null;
  sourceMessageId?: string | null;
  priority?: number;
  extractedMeta?: Prisma.InputJsonValue;
};

export async function getKnowledgeBasePage(
  userId: string,
  filters: { page?: number; q?: string } = {},
) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      entries: [],
      activeCount: 0,
      draftCount: 0,
      pagination: { page: 1, pageCount: 1, pageSize: 20, total: 0 },
    };
  }

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = 20;
  const query = filters.q?.trim().slice(0, 120) || undefined;
  const where = {
    businessId: business.id,
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" as const } },
            { category: { contains: query, mode: "insensitive" as const } },
            { content: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [entries, total, activeCount, draftCount] = await Promise.all([
    prisma.knowledgeBase.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        title: true,
        content: true,
        category: true,
        isActive: true,
        sourceType: true,
        reviewStatus: true,
        sourceName: true,
        sourceUrl: true,
        priority: true,
        updatedAt: true,
      },
    }),
    prisma.knowledgeBase.count({ where }),
    prisma.knowledgeBase.count({
      where: {
        businessId: business.id,
        isActive: true,
        reviewStatus: KnowledgeReviewStatus.APPROVED,
      },
    }),
    prisma.knowledgeBase.count({
      where: { businessId: business.id, reviewStatus: KnowledgeReviewStatus.DRAFT },
    }),
  ]);

  return {
    business,
    activeCount,
    draftCount,
    pagination: {
      page,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
      pageSize,
      total,
    },
    entries: entries.map((entry) => ({
      ...entry,
      updatedAt: entry.updatedAt.toISOString().slice(0, 10),
    })),
  };
}

export async function getActiveKnowledgeContext(
  businessId: string,
  query = "",
) {
  const normalizedQuery = query.trim().slice(0, 2_000);
  return ttlCache(`knowledge-context:${businessId}:${normalizedQuery}`, 60_000, () =>
    getActiveKnowledgeContextFresh(businessId, normalizedQuery),
  );
}

async function getActiveKnowledgeContextFresh(businessId: string, query: string) {
  const entries = await prisma.knowledgeBase.findMany({
    where: {
      businessId,
      isActive: true,
      reviewStatus: KnowledgeReviewStatus.APPROVED,
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      title: true,
      category: true,
      content: true,
      sourceType: true,
      priority: true,
      updatedAt: true,
    },
  });

  if (entries.length === 0) {
    return "Belum ada knowledge base. Jawab secara umum dan kumpulkan kebutuhan customer tanpa membuat klaim spesifik.";
  }

  return buildKnowledgePromptContext(rankRelevantKnowledge(entries, query));
}

export async function createKnowledgeBaseEntry(userId: string, input: KnowledgeBaseInput) {
  const business = await requireBusinessForUser(userId);
  const normalized = normalizeKnowledgeTextInput(input);
  const reviewStatus = input.reviewStatus ?? KnowledgeReviewStatus.APPROVED;
  const priority = normalizePriority(
    input.priority ?? defaultKnowledgePriority(input.sourceType ?? KnowledgeSourceType.MANUAL),
  );

  const entry = await prisma.knowledgeBase.create({
    data: {
      businessId: business.id,
      title: normalized.title,
      content: normalized.content,
      category: normalized.category,
      isActive:
        reviewStatus === KnowledgeReviewStatus.APPROVED
          ? input.isActive ?? true
          : false,
      sourceType: input.sourceType ?? KnowledgeSourceType.MANUAL,
      reviewStatus,
      sourceUrl: cleanOptional(input.sourceUrl, 2_048),
      sourceName: cleanOptional(input.sourceName, 255),
      sourceMessageId: cleanOptional(input.sourceMessageId, 255),
      priority,
      extractedMeta: input.extractedMeta,
      approvedAt: reviewStatus === KnowledgeReviewStatus.APPROVED ? new Date() : null,
    },
  });
  invalidateTtlCache(`knowledge-context:${business.id}`);

  return entry;
}

export async function createConversationKnowledgeDraft(params: {
  userId: string;
  conversationId: string;
  messageId: string;
  content: string;
}) {
  const content = params.content.trim();
  return createKnowledgeBaseEntry(params.userId, {
    title: `Jawaban tim: ${content.slice(0, 90)}`,
    category: "jawaban-tim",
    content,
    isActive: false,
    sourceType: KnowledgeSourceType.CONVERSATION,
    reviewStatus: KnowledgeReviewStatus.DRAFT,
    sourceName: `Percakapan ${params.conversationId}`,
    sourceMessageId: params.messageId,
    priority: 75,
  });
}

export async function updateKnowledgeBaseEntry(
  userId: string,
  entryId: string,
  input: KnowledgeBaseInput,
) {
  const business = await requireBusinessForUser(userId);
  const normalized = normalizeKnowledgeTextInput(input);
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id: entryId, businessId: business.id },
    select: { id: true, reviewStatus: true },
  });

  if (!existing) {
    throw new Error("Knowledge base entry tidak ditemukan.");
  }
  const entry = await prisma.knowledgeBase.update({
    where: { id: entryId },
    data: {
      title: normalized.title,
      content: normalized.content,
      category: normalized.category,
      isActive:
        existing.reviewStatus === KnowledgeReviewStatus.APPROVED
          ? input.isActive ?? true
          : false,
    },
  });
  invalidateTtlCache(`knowledge-context:${business.id}`);

  return entry;
}

export async function reviewKnowledgeBaseEntry(
  userId: string,
  entryId: string,
  decision: "approve" | "reject",
) {
  const business = await requireBusinessForUser(userId);
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id: entryId, businessId: business.id },
    select: { id: true },
  });
  if (!existing) throw new Error("Knowledge base entry tidak ditemukan.");

  await prisma.knowledgeBase.update({
    where: { id: entryId },
    data:
      decision === "approve"
        ? {
            reviewStatus: KnowledgeReviewStatus.APPROVED,
            isActive: true,
            approvedAt: new Date(),
          }
        : {
            reviewStatus: KnowledgeReviewStatus.REJECTED,
            isActive: false,
            approvedAt: null,
          },
  });
  invalidateTtlCache(`knowledge-context:${business.id}`);
}

export async function deleteKnowledgeBaseEntry(userId: string, entryId: string) {
  const business = await requireBusinessForUser(userId);
  const result = await prisma.knowledgeBase.deleteMany({
    where: { id: entryId, businessId: business.id },
  });

  if (result.count !== 1) {
    throw new Error("Knowledge base entry tidak ditemukan.");
  }
  invalidateTtlCache(`knowledge-context:${business.id}`);
}

export async function createKnowledgeTemplate(userId: string, templateKey: string) {
  const business = await requireBusinessForUser(userId);
  const template = knowledgeTemplates.find((item) => item.key === templateKey);

  if (!template) {
    throw new Error("Template knowledge tidak ditemukan.");
  }
  const existing = await prisma.knowledgeBase.findFirst({
    where: {
      businessId: business.id,
      title: template.title,
      category: template.category,
    },
    select: { id: true },
  });
  const entry = existing
    ? await prisma.knowledgeBase.update({
        where: { id: existing.id },
        data: {
          content: template.content,
          isActive: true,
          reviewStatus: KnowledgeReviewStatus.APPROVED,
          approvedAt: new Date(),
        },
      })
    : await prisma.knowledgeBase.create({
        data: {
          businessId: business.id,
          title: template.title,
          category: template.category,
          content: template.content,
          isActive: true,
          sourceType: KnowledgeSourceType.MANUAL,
          reviewStatus: KnowledgeReviewStatus.APPROVED,
          priority: 80,
          approvedAt: new Date(),
        },
      });
  invalidateTtlCache(`knowledge-context:${business.id}`);

  return entry;
}

export async function generateStarterKnowledge(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    select: {
      id: true,
      businessName: true,
      businessType: true,
      mainServices: true,
      serviceArea: true,
      operatingHours: true,
    },
  });

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  const fallback = {
    entries: [
      {
        title: `Profil ${business.businessName}`,
        category: "profile",
        content: [
          `${business.businessName} adalah ${business.businessType ?? "bisnis"} yang melayani ${business.mainServices ?? "kebutuhan customer"}.`,
          business.serviceArea ? `Area layanan: ${business.serviceArea}.` : null,
          business.operatingHours ? `Jam operasional: ${business.operatingHours}.` : null,
        ]
          .filter(Boolean)
          .join(" "),
      },
      {
        title: "FAQ Awal",
        category: "faq",
        content:
          "Jika customer bertanya harga dan ada harga katalog atau harga mulai dari website, sebutkan harga publik itu terlebih dahulu sebagai harga awal. Setelah itu minta detail kebutuhan, lokasi, scope, atau timeline yang masih diperlukan. Jangan memberikan quotation final tanpa review owner.",
      },
      {
        title: "Aturan Handoff",
        category: "handoff",
        content:
          "Handoff ke owner jika customer meminta manusia/admin, meminta harga final, menyampaikan komplain, atau kebutuhan terlalu teknis/detail.",
      },
    ],
  };
  const result = await callGroqJson<typeof fallback>({
    fallback,
    system: [
      "Generate starter knowledge base entries for a WhatsApp AI customer-service agent.",
      "Return only valid JSON with this schema:",
      '{ "entries": [{ "title": string, "category": "profile" | "services" | "faq" | "pricing" | "handoff", "content": string }] }',
      "Create concise Indonesian content. Do not invent exact prices.",
    ].join("\n"),
    user: JSON.stringify(business),
  });
  const entries = Array.isArray(result.data.entries) ? result.data.entries.slice(0, 5) : fallback.entries;

  await Promise.all(
    entries.map((entry) => {
      const normalized = normalizeKnowledgeTextInput({
        title: entry.title || "Starter knowledge",
        category: entry.category || "general",
        content: entry.content || "Lengkapi knowledge ini.",
      });

      return prisma.knowledgeBase.create({
        data: {
          businessId: business.id,
          ...normalized,
          isActive: false,
          sourceType: KnowledgeSourceType.ONBOARDING,
          reviewStatus: KnowledgeReviewStatus.DRAFT,
          priority: 90,
          sourceName: "Generator knowledge awal",
        },
      });
    }),
  );
  invalidateTtlCache(`knowledge-context:${business.id}`);
}

export function parseKnowledgeBaseFormData(formData: FormData) {
  const normalized = normalizeKnowledgeTextInput({
    title: String(formData.get("title") ?? ""),
    content: String(formData.get("content") ?? ""),
    category: String(formData.get("category") ?? ""),
  });

  return {
    ...normalized,
    isActive: formData.get("isActive") === "on",
  } satisfies KnowledgeBaseInput;
}

function defaultKnowledgePriority(sourceType: KnowledgeSourceType) {
  return {
    [KnowledgeSourceType.MANUAL]: 90,
    [KnowledgeSourceType.ONBOARDING]: 90,
    [KnowledgeSourceType.CONVERSATION]: 75,
    [KnowledgeSourceType.FILE]: 70,
    [KnowledgeSourceType.WEBSITE]: 60,
  }[sourceType];
}

function normalizePriority(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function cleanOptional(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.trim().slice(0, maxLength);
  return cleaned || null;
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true, websiteUrl: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  return business;
}

export const knowledgeTemplates = [
  {
    key: "faq",
    title: "FAQ Customer",
    category: "faq",
    content:
      "Q: Bisa konsultasi dulu? A: Bisa, jelaskan kebutuhan, lokasi, jumlah perangkat/titik, kondisi existing, dan target waktu. Owner akan bantu follow-up untuk detail teknis.",
  },
  {
    key: "services",
    title: "Daftar Layanan",
    category: "services",
    content:
      "Tuliskan layanan utama bisnis di sini: layanan yang tersedia, batasan pekerjaan, area layanan, dan data yang perlu dikumpulkan dari customer sebelum quotation.",
  },
  {
    key: "pricing",
    title: "Pricing Guardrail",
    category: "pricing",
    content:
      "AI boleh menyebut harga katalog, range, atau harga mulai dari website yang sudah dipublikasikan. Jelaskan bahwa angka tersebut adalah harga awal, bukan quotation final. Harga final tetap mengikuti scope, lokasi, jumlah item/perangkat, urgency, integrasi, dan kondisi existing serta dikonfirmasi owner.",
  },
  {
    key: "handoff",
    title: "Handoff Rules",
    category: "handoff",
    content:
      "Handoff ke owner jika customer meminta manusia/admin, meminta harga final, komplain, marah, meminta diskon spesifik, atau kebutuhan terlalu teknis/detail.",
  },
];
