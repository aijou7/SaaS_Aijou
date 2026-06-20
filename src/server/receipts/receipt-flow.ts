import {
  ActorType,
  CategoryType,
  Prisma,
  ReviewStatus,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/client";
import { formatCurrencyIDR } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { extractReceiptFromMedia } from "@/server/receipts/ocr";
import { downloadWhatsAppMedia } from "@/server/whatsapp/client";

type StoredImageContext = {
  businessId: string;
  conversationId: string;
  messageId: string;
  mediaFileId: string | null;
};

type ReceiptReviewInput = {
  transactionDate: string;
  merchantName?: string;
  categoryName?: string;
  projectName?: string;
  totalAmount: number;
  description?: string;
};

export async function createReceiptDraftFromImage(params: {
  context: StoredImageContext;
  providerMediaId?: string | null;
}) {
  if (!params.context.mediaFileId) {
    return {
      action: "receipt_media_missing",
      reply: "Foto nota diterima, tapi media belum tersimpan. Coba upload ulang ya.",
    };
  }

  const mediaFile = await prisma.mediaFile.findFirst({
    where: {
      id: params.context.mediaFileId,
      businessId: params.context.businessId,
    },
    select: {
      id: true,
      providerMediaId: true,
      mimeType: true,
    },
  });

  if (!mediaFile) {
    return {
      action: "receipt_media_not_found",
      reply: "Foto nota diterima, tapi file media tidak ditemukan.",
    };
  }

  const mediaDownload = mediaFile.providerMediaId
    ? await downloadWhatsAppMedia({
        mediaId: mediaFile.providerMediaId,
        businessId: params.context.businessId,
      })
    : null;

  if (mediaDownload?.downloaded) {
    await prisma.mediaFile.update({
      where: {
        id: mediaFile.id,
      },
      data: {
        storagePath: mediaDownload.storagePath,
        mimeType: mediaDownload.mimeType ?? mediaFile.mimeType,
        fileSize: mediaDownload.fileSize,
      },
    });
  }

  const extraction = await extractReceiptFromMedia({
    providerMediaId: mediaFile.providerMediaId ?? params.providerMediaId,
    mimeType: mediaFile.mimeType,
  });

  const category = await upsertCategory(params.context.businessId, extraction.categoryName);
  const transactionDate = extraction.transactionDate
    ? parseDate(extraction.transactionDate)
    : new Date();
  const totalAmount = extraction.totalAmount ?? 0;

  const transaction = await prisma.transaction.create({
    data: {
      businessId: params.context.businessId,
      conversationId: params.context.conversationId,
      transactionType: TransactionType.EXPENSE,
      transactionDate,
      merchantName: extraction.merchantName,
      categoryId: category?.id,
      totalAmount: String(totalAmount),
      description: extraction.merchantName
        ? `Nota dari ${extraction.merchantName}`
        : "Receipt image pending review",
      source: TransactionSource.WHATSAPP_RECEIPT,
      status:
        extraction.confidenceScore >= 0.75 && extraction.totalAmount
          ? TransactionStatus.PENDING_CONFIRMATION
          : TransactionStatus.NEEDS_REVIEW,
      confidenceScore: String(extraction.confidenceScore),
    },
  });

  const receipt = await prisma.receipt.create({
    data: {
      transactionId: transaction.id,
      mediaFileId: mediaFile.id,
      rawOcrText: extraction.rawText,
      extractedJson: toJson(extraction),
      confidenceScore: String(extraction.confidenceScore),
      reviewStatus:
        extraction.confidenceScore >= 0.75 && extraction.totalAmount
          ? ReviewStatus.PENDING
          : ReviewStatus.NEEDS_REVIEW,
    },
  });

  const reply =
    extraction.totalAmount && extraction.confidenceScore >= 0.75
      ? `Saya membaca nota ini sekitar ${formatCurrencyIDR(extraction.totalAmount)}. Saya simpan sebagai pending dulu untuk review.`
      : "Foto nota sudah saya terima dan masuk ke Receipt Review karena OCR belum yakin.";

  await prisma.aiLog.create({
    data: {
      businessId: params.context.businessId,
      conversationId: params.context.conversationId,
      messageId: params.context.messageId,
      inputText: `receipt_image:${mediaFile.providerMediaId ?? mediaFile.id}`,
      outputText: reply,
      structuredOutput: toJson(extraction),
      intent: "receipt_extract",
      confidenceScore: String(extraction.confidenceScore),
      actionTaken: "receipt_draft_created",
    },
  });

  return {
    action: "receipt_draft_created",
    transactionId: transaction.id,
    receiptId: receipt.id,
    reply,
  };
}

export async function getReceiptReviewPage(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      receipts: [],
      categories: [],
      projects: [],
      summary: {
        needsReview: 0,
        pending: 0,
        reviewed: 0,
      },
    };
  }

  const [receipts, categories, projects, needsReview, pending, reviewed] = await Promise.all([
    prisma.receipt.findMany({
      where: {
        transaction: {
          businessId: business.id,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
      select: {
        id: true,
        rawOcrText: true,
        extractedJson: true,
        confidenceScore: true,
        reviewStatus: true,
        createdAt: true,
        mediaFile: {
          select: {
            providerMediaId: true,
            mimeType: true,
            storagePath: true,
            fileUrl: true,
          },
        },
        transaction: {
          select: {
            id: true,
            transactionDate: true,
            merchantName: true,
            totalAmount: true,
            description: true,
            status: true,
            category: { select: { name: true } },
            project: { select: { projectName: true } },
          },
        },
      },
    }),
    prisma.category.findMany({
      where: { businessId: business.id, type: CategoryType.EXPENSE },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.project.findMany({
      where: { businessId: business.id },
      orderBy: { projectName: "asc" },
      select: { id: true, projectName: true },
    }),
    prisma.receipt.count({
      where: {
        reviewStatus: ReviewStatus.NEEDS_REVIEW,
        transaction: { businessId: business.id },
      },
    }),
    prisma.receipt.count({
      where: {
        reviewStatus: ReviewStatus.PENDING,
        transaction: { businessId: business.id },
      },
    }),
    prisma.receipt.count({
      where: {
        reviewStatus: ReviewStatus.REVIEWED,
        transaction: { businessId: business.id },
      },
    }),
  ]);

  return {
    business,
    categories,
    projects,
    summary: {
      needsReview,
      pending,
      reviewed,
    },
    receipts: receipts.map((receipt) => ({
      id: receipt.id,
      rawOcrText: receipt.rawOcrText ?? "",
      extractedJson: receipt.extractedJson,
      confidenceScore:
        receipt.confidenceScore === null ? null : Number(receipt.confidenceScore),
      reviewStatus: receipt.reviewStatus,
      createdAt: receipt.createdAt.toISOString().slice(0, 10),
      mediaFile: receipt.mediaFile,
      transaction: {
        id: receipt.transaction.id,
        transactionDate: receipt.transaction.transactionDate.toISOString().slice(0, 10),
        merchantName: receipt.transaction.merchantName ?? "",
        totalAmount: Number(receipt.transaction.totalAmount),
        description: receipt.transaction.description ?? "",
        status: receipt.transaction.status,
        categoryName: receipt.transaction.category?.name ?? "",
        projectName: receipt.transaction.project?.projectName ?? "",
      },
    })),
  };
}

export async function confirmReceiptReview(userId: string, receiptId: string, input: ReceiptReviewInput) {
  const business = await requireBusinessForUser(userId);
  const receipt = await findReceiptForBusiness(receiptId, business.id);
  const category = await upsertCategory(business.id, input.categoryName);
  const project = await upsertProject(business.id, input.projectName);

  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.update({
      where: { id: receipt.transaction.id },
      data: {
        transactionDate: parseDate(input.transactionDate),
        merchantName: cleanOptional(input.merchantName),
        categoryId: category?.id,
        projectId: project?.id,
        totalAmount: String(input.totalAmount),
        description: cleanOptional(input.description),
        status: TransactionStatus.CONFIRMED,
        confidenceScore: "1",
      },
    });

    const updatedReceipt = await tx.receipt.update({
      where: { id: receiptId },
      data: {
        reviewStatus: ReviewStatus.REVIEWED,
        confidenceScore: "1",
      },
    });

    return { transaction, receipt: updatedReceipt };
  });

  await writeReceiptAuditLog({
    businessId: business.id,
    actorId: userId,
    entityId: receiptId,
    action: "receipt_review_confirmed",
    beforeJson: receipt,
    afterJson: updated,
  });

  return updated;
}

export async function rejectReceiptReview(userId: string, receiptId: string) {
  const business = await requireBusinessForUser(userId);
  const receipt = await findReceiptForBusiness(receiptId, business.id);

  const updated = await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.update({
      where: { id: receipt.transaction.id },
      data: { status: TransactionStatus.REJECTED },
    });

    const updatedReceipt = await tx.receipt.update({
      where: { id: receiptId },
      data: { reviewStatus: ReviewStatus.REJECTED },
    });

    return { transaction, receipt: updatedReceipt };
  });

  await writeReceiptAuditLog({
    businessId: business.id,
    actorId: userId,
    entityId: receiptId,
    action: "receipt_review_rejected",
    beforeJson: receipt,
    afterJson: updated,
  });

  return updated;
}

export function parseReceiptReviewFormData(formData: FormData) {
  const totalAmount = Number(String(formData.get("totalAmount") ?? "").replace(/[^\d.-]/g, ""));

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Nominal receipt harus lebih dari 0.");
  }

  return {
    transactionDate: String(formData.get("transactionDate") ?? ""),
    merchantName: String(formData.get("merchantName") ?? ""),
    categoryName: String(formData.get("categoryName") ?? ""),
    projectName: String(formData.get("projectName") ?? ""),
    totalAmount,
    description: String(formData.get("description") ?? ""),
  } satisfies ReceiptReviewInput;
}

async function findReceiptForBusiness(receiptId: string, businessId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: {
      id: receiptId,
      transaction: {
        businessId,
      },
    },
    include: {
      transaction: true,
    },
  });

  if (!receipt) {
    throw new Error("Receipt tidak ditemukan.");
  }

  return receipt;
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

async function upsertCategory(businessId: string, categoryName?: string | null) {
  const name = cleanOptional(categoryName);

  if (!name) {
    return null;
  }

  return prisma.category.upsert({
    where: {
      businessId_name_type: {
        businessId,
        name,
        type: CategoryType.EXPENSE,
      },
    },
    update: {},
    create: {
      businessId,
      name,
      type: CategoryType.EXPENSE,
    },
  });
}

async function upsertProject(businessId: string, projectName?: string | null) {
  const name = cleanOptional(projectName);

  if (!name) {
    return null;
  }

  return prisma.project.upsert({
    where: {
      businessId_projectName: {
        businessId,
        projectName: name,
      },
    },
    update: {},
    create: {
      businessId,
      projectName: name,
    },
  });
}

async function writeReceiptAuditLog(params: {
  businessId: string;
  actorId: string;
  entityId: string;
  action: string;
  beforeJson?: unknown;
  afterJson?: unknown;
}) {
  await prisma.auditLog.create({
    data: {
      businessId: params.businessId,
      actorType: ActorType.USER,
      actorId: params.actorId,
      entityType: "receipt",
      entityId: params.entityId,
      action: params.action,
      beforeJson: toJson(params.beforeJson),
      afterJson: toJson(params.afterJson),
    },
  });
}

function parseDate(value: string) {
  if (!value) {
    throw new Error("Tanggal receipt wajib diisi.");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function cleanOptional(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function toJson(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
