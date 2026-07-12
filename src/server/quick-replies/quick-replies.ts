import { Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { invalidateTtlCache, ttlCache } from "@/lib/ttl-cache";

const defaultQuickReplies = [
  {
    name: "Minta lokasi",
    content: "Siap, boleh share lokasi project dan area yang perlu dicover?",
    shortcut: "/lokasi",
    category: "Discovery",
    sortOrder: 10,
  },
  {
    name: "Ajak survey",
    content:
      "Untuk scope seperti ini idealnya kita survey/discovery dulu supaya rekomendasi dan estimasinya nggak asal. Kapan waktu yang enak untuk dibahas?",
    shortcut: "/survey",
    category: "Discovery",
    sortOrder: 20,
  },
  {
    name: "Minta kontak",
    content: "Boleh kirim nomor WhatsApp aktif? Nanti tim Aijou follow up dari sana.",
    shortcut: "/kontak",
    category: "Follow-up",
    sortOrder: 30,
  },
  {
    name: "Minta detail scope",
    content:
      "Boleh bantu detailkan jumlah titik/user, kondisi existing, target waktu, dan budget range-nya? Dari situ kami bisa petakan solusi awal.",
    shortcut: "/scope",
    category: "Discovery",
    sortOrder: 40,
  },
];

type QuickReplyInput = {
  name: string;
  content: string;
  shortcut?: string | null;
  category?: string | null;
  isPrivate?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export async function getQuickRepliesPage(userId: string, filters: { q?: string } = {}) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      quickReplies: [],
      summary: { total: 0, active: 0, private: 0 },
    };
  }

  await ensureDefaultQuickReplies(business.id);
  const q = filters.q?.trim().slice(0, 120);
  const where: Prisma.QuickReplyWhereInput = {
    businessId: business.id,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } },
            { shortcut: { contains: q, mode: "insensitive" } },
            { category: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [quickReplies, total, active, privateCount] = await Promise.all([
    prisma.quickReply.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        content: true,
        shortcut: true,
        category: true,
        isPrivate: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.quickReply.count({ where: { businessId: business.id } }),
    prisma.quickReply.count({ where: { businessId: business.id, isActive: true } }),
    prisma.quickReply.count({ where: { businessId: business.id, isPrivate: true } }),
  ]);

  return {
    business,
    quickReplies: quickReplies.map((reply) => ({
      ...reply,
      createdAt: reply.createdAt.toISOString().slice(0, 10),
      updatedAt: reply.updatedAt.toISOString().slice(0, 10),
    })),
    summary: {
      total,
      active,
      private: privateCount,
    },
  };
}

export async function getActiveQuickRepliesForUser(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return [];
  }

  await ensureDefaultQuickReplies(business.id);

  return ttlCache(`quick-replies-active:${business.id}`, 30_000, () =>
    prisma.quickReply.findMany({
      where: { businessId: business.id, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        content: true,
        shortcut: true,
        category: true,
      },
    }),
  );
}

export async function createQuickReply(userId: string, formData: FormData) {
  const business = await requireBusinessForUser(userId);
  const input = parseQuickReplyFormData(formData);
  invalidateTtlCache(`quick-replies-active:${business.id}`);

  return prisma.quickReply.create({
    data: {
      businessId: business.id,
      ...input,
    },
  });
}

export async function updateQuickReply(userId: string, quickReplyId: string, formData: FormData) {
  const business = await requireBusinessForUser(userId);
  const input = parseQuickReplyFormData(formData);
  invalidateTtlCache(`quick-replies-active:${business.id}`);

  return prisma.quickReply.update({
    where: { id: quickReplyId, businessId: business.id },
    data: input,
  });
}

export async function deleteQuickReply(userId: string, quickReplyId: string) {
  const business = await requireBusinessForUser(userId);
  invalidateTtlCache(`quick-replies-active:${business.id}`);

  return prisma.quickReply.update({
    where: { id: quickReplyId, businessId: business.id },
    data: { isActive: false },
  });
}

async function ensureDefaultQuickReplies(businessId: string) {
  const count = await prisma.quickReply.count({ where: { businessId } });

  if (count > 0) {
    return;
  }

  await prisma.quickReply.createMany({
    data: defaultQuickReplies.map((reply) => ({
      businessId,
      ...reply,
    })),
    skipDuplicates: true,
  });
}

function parseQuickReplyFormData(formData: FormData): QuickReplyInput {
  const name = String(formData.get("name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const shortcut = cleanOptional(String(formData.get("shortcut") ?? ""));
  const category = cleanOptional(String(formData.get("category") ?? ""));
  const sortOrderValue = Number(formData.get("sortOrder") ?? 0);

  if (!name) {
    throw new Error("Nama quick reply wajib diisi.");
  }

  if (!content) {
    throw new Error("Isi quick reply wajib diisi.");
  }

  if (name.length > 80) {
    throw new Error("Nama quick reply maksimal 80 karakter.");
  }

  if (content.length > 1000) {
    throw new Error("Isi quick reply maksimal 1000 karakter.");
  }

  return {
    name,
    content,
    shortcut,
    category,
    isPrivate: formData.get("isPrivate") === "on",
    isActive: formData.get("isActive") === "on",
    sortOrder: Number.isFinite(sortOrderValue) ? Math.round(sortOrderValue) : 0,
  };
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

function cleanOptional(value: string) {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}
