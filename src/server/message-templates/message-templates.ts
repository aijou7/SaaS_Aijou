import { Prisma, WhatsAppTemplatePurpose, WorkspaceRole } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAccess } from "@/server/workspace-access";

const maxImageBytes = 5 * 1024 * 1024;
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

type MessageTemplateFilters = {
  q?: string;
};

export async function getMessageTemplatesPage(userId: string, filters: MessageTemplateFilters = {}) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const q = filters.q?.trim().slice(0, 120);
  const where: Prisma.WhatsAppTemplateWhereInput = {
    businessId: access.businessId,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [templates, total, approved, inReview, rejected] = await Promise.all([
    prisma.whatsAppTemplate.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        name: true,
        purpose: true,
        languageCode: true,
        title: true,
        body: true,
        headerImageUrl: true,
        status: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.whatsAppTemplate.count({ where: { businessId: access.businessId } }),
    prisma.whatsAppTemplate.count({ where: { businessId: access.businessId, status: "APPROVED" } }),
    prisma.whatsAppTemplate.count({ where: { businessId: access.businessId, status: "IN_REVIEW" } }),
    prisma.whatsAppTemplate.count({ where: { businessId: access.businessId, status: "REJECTED" } }),
  ]);

  return {
    businessName: access.businessName,
    templates: templates.map((template) => ({
      ...template,
      createdAt: formatDate(template.createdAt),
      updatedAt: formatDate(template.updatedAt),
    })),
    summary: { total, approved, inReview, rejected },
  };
}

export async function createMessageTemplate(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const input = parseMessageTemplateFormData(formData);
  const image = await uploadTemplateImage(access.businessId, input.image);

  try {
    return await prisma.whatsAppTemplate.create({
      data: {
        businessId: access.businessId,
        name: input.name,
        purpose: input.purpose,
        languageCode: input.languageCode,
        title: input.title,
        body: input.body,
        headerImageUrl: image?.url ?? null,
        headerImagePath: image?.pathname ?? null,
      },
    });
  } catch (error) {
    if (image?.pathname && process.env.BLOB_READ_WRITE_TOKEN) {
      const { del } = await import("@vercel/blob");
      await del(image.pathname).catch(() => undefined);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Nama template sudah dipakai di workspace ini.");
    }

    throw error;
  }
}

function parseMessageTemplateFormData(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().toLowerCase();
  const purpose = String(formData.get("purpose") ?? "UTILITY") as WhatsAppTemplatePurpose;
  const languageCode = String(formData.get("languageCode") ?? "id").trim();
  const title = cleanOptional(formData.get("title"), 60);
  const body = String(formData.get("body") ?? "").trim();
  const imageValue = formData.get("headerImage");
  const image = imageValue instanceof File && imageValue.size > 0 ? imageValue : null;

  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    throw new Error("Nama template hanya boleh berisi huruf kecil, angka, dan underscore.");
  }

  if (!Object.values(WhatsAppTemplatePurpose).includes(purpose)) {
    throw new Error("Tujuan pesan tidak valid.");
  }

  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(languageCode)) {
    throw new Error("Kode bahasa template tidak valid.");
  }

  if (!body) throw new Error("Isi pesan wajib diisi.");
  if (body.length > 1024) throw new Error("Isi pesan maksimal 1.024 karakter.");

  if (image && (!allowedImageTypes.has(image.type) || image.size > maxImageBytes)) {
    throw new Error("Gambar harus JPG, PNG, atau WEBP dan maksimal 5 MB.");
  }

  return { name, purpose, languageCode, title, body, image };
}

async function uploadTemplateImage(businessId: string, image: File | null) {
  if (!image) return null;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Upload gambar belum aktif karena BLOB_READ_WRITE_TOKEN belum dikonfigurasi.");
  }

  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  const { put } = await import("@vercel/blob");
  const blob = await put(`templates/${businessId}/${crypto.randomUUID()}.${extension}`, Buffer.from(await image.arrayBuffer()), {
    access: "public",
    addRandomSuffix: false,
    contentType: image.type,
  });

  return { url: blob.url, pathname: blob.pathname };
}

function cleanOptional(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}
