import { prisma } from "@/lib/prisma";
import {
  buildKnowledgePromptContext,
  normalizeKnowledgeTextInput,
} from "@/lib/knowledge-limits";
import { invalidateTtlCache, ttlCache } from "@/lib/ttl-cache";
import { callGroqJson } from "@/server/ai/groq";

type KnowledgeBaseInput = {
  title: string;
  content: string;
  category?: string;
  isActive?: boolean;
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
  const [entries, total, activeCount] = await Promise.all([
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
        updatedAt: true,
      },
    }),
    prisma.knowledgeBase.count({ where }),
    prisma.knowledgeBase.count({
      where: { businessId: business.id, isActive: true },
    }),
  ]);

  return {
    business,
    activeCount,
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

export async function getActiveKnowledgeContext(businessId: string) {
  return ttlCache(`knowledge-context:${businessId}`, 60_000, () =>
    getActiveKnowledgeContextFresh(businessId),
  );
}

async function getActiveKnowledgeContextFresh(businessId: string) {
  const entries = await prisma.knowledgeBase.findMany({
    where: {
      businessId,
      isActive: true,
    },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
    select: {
      title: true,
      category: true,
      content: true,
    },
  });

  if (entries.length === 0) {
    return "Belum ada knowledge base. Jawab secara umum dan kumpulkan kebutuhan customer tanpa membuat klaim spesifik.";
  }

  return buildKnowledgePromptContext(entries);
}

export async function createKnowledgeBaseEntry(userId: string, input: KnowledgeBaseInput) {
  const business = await requireBusinessForUser(userId);
  const normalized = normalizeKnowledgeTextInput(input);

  const entry = await prisma.knowledgeBase.create({
    data: {
      businessId: business.id,
      title: normalized.title,
      content: normalized.content,
      category: normalized.category,
      isActive: input.isActive ?? true,
    },
  });
  invalidateTtlCache(`knowledge-context:${business.id}`);

  return entry;
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
    select: { id: true },
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
      isActive: input.isActive ?? true,
    },
  });
  invalidateTtlCache(`knowledge-context:${business.id}`);

  return entry;
}

export async function deleteKnowledgeBaseEntry(userId: string, entryId: string) {
  const business = await requireBusinessForUser(userId);
  const existing = await prisma.knowledgeBase.findFirst({
    where: { id: entryId, businessId: business.id },
    select: { id: true },
  });

  if (!existing) {
    throw new Error("Knowledge base entry tidak ditemukan.");
  }

  await prisma.knowledgeBase.update({
    where: { id: entryId },
    data: { isActive: false },
  });
  invalidateTtlCache(`knowledge-context:${business.id}`);
}

export async function createKnowledgeTemplate(userId: string, templateKey: string) {
  const business = await requireBusinessForUser(userId);
  const template = knowledgeTemplates.find((item) => item.key === templateKey);

  if (!template) {
    throw new Error("Template knowledge tidak ditemukan.");
  }
  const entry = await prisma.knowledgeBase.create({
    data: {
      businessId: business.id,
      title: template.title,
      category: template.category,
      content: template.content,
      isActive: true,
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
          "Jika customer bertanya harga, minta detail kebutuhan, lokasi, scope pekerjaan, timeline, dan budget. Jangan memberikan harga final tanpa review owner.",
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
          isActive: true,
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
      "AI tidak boleh memberi harga final. AI hanya boleh menyebut bahwa estimasi tergantung scope, lokasi, jumlah item/perangkat, urgency, dan kondisi existing. Harga final dari owner.",
  },
  {
    key: "handoff",
    title: "Handoff Rules",
    category: "handoff",
    content:
      "Handoff ke owner jika customer meminta manusia/admin, meminta harga final, komplain, marah, meminta diskon spesifik, atau kebutuhan terlalu teknis/detail.",
  },
];
