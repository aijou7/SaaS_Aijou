import {
  ActorType,
  CategoryType,
  Prisma,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma-beta/client";
import { formatCurrencyIDR } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type TransactionFilters = {
  status?: string;
  transactionType?: string;
  categoryId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
};

type TransactionInput = {
  transactionDate: string;
  merchantName?: string;
  customerPhone?: string;
  address?: string;
  categoryName?: string;
  projectName?: string;
  totalAmount: number;
  description?: string;
  notes?: string;
  productId?: string;
  quantity?: number;
  discount?: number;
  shipping?: number;
  vat?: number;
  transactionType?: TransactionType;
  status?: TransactionStatus;
};

export async function getTransactionsPage(userId: string, filters: TransactionFilters) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return emptyTransactionsPage();
  }

  const where = buildTransactionWhere(business.id, filters);
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const pageNumber = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize ?? 25));
  const [transactions, filteredCount, confirmedCount, totalConfirmedThisMonth, totalPending, totalNeedsReview, categories, projects, products] =
    await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
        skip: (pageNumber - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          transactionDate: true,
          merchantName: true,
          totalAmount: true,
          transactionType: true,
          description: true,
          source: true,
          status: true,
          confidenceScore: true,
          category: { select: { id: true, name: true } },
          project: { select: { id: true, projectName: true } },
          paymentSessions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              paymentLinkUrl: true,
              expiresAt: true,
            },
          },
        },
      }),
      prisma.transaction.count({ where }),
      prisma.transaction.count({
        where: { ...where, status: TransactionStatus.CONFIRMED },
      }),
      prisma.transaction.aggregate({
        where: {
          businessId: business.id,
          transactionType: TransactionType.INCOME,
          status: TransactionStatus.CONFIRMED,
          transactionDate: { gte: startOfMonth },
        },
        _sum: { totalAmount: true },
      }),
      prisma.transaction.count({
        where: {
          businessId: business.id,
          status: TransactionStatus.PENDING_CONFIRMATION,
        },
      }),
      prisma.transaction.count({
        where: {
          businessId: business.id,
          status: TransactionStatus.NEEDS_REVIEW,
        },
      }),
      prisma.category.findMany({
        where: { businessId: business.id },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.project.findMany({
        where: { businessId: business.id },
        orderBy: { projectName: "asc" },
        select: { id: true, projectName: true },
      }),
      prisma.product.findMany({
        where: { businessId: business.id, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, description: true, price: true, currency: true },
      }),
    ]);

  return {
    business,
    summary: {
      totalConfirmedThisMonth: Number(totalConfirmedThisMonth._sum.totalAmount ?? 0),
      totalPending,
      totalNeedsReview,
      filteredCount,
      confirmedCount,
      page: pageNumber,
      pageSize,
      pageCount: Math.max(1, Math.ceil(filteredCount / pageSize)),
    },
    categories,
    projects,
    products: products.map((product) => ({
      ...product,
      price: Number(product.price),
    })),
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
      merchantName: transaction.merchantName ?? "",
      categoryId: transaction.category?.id ?? "",
      categoryName: transaction.category?.name ?? "",
      projectId: transaction.project?.id ?? "",
      projectName: transaction.project?.projectName ?? "",
      totalAmount: Number(transaction.totalAmount),
      transactionType: transaction.transactionType,
      description: transaction.description ?? "",
      source: transaction.source,
      status: transaction.status,
      confidenceScore:
        transaction.confidenceScore === null ? null : Number(transaction.confidenceScore),
      payment: transaction.paymentSessions[0]
        ? {
            ...transaction.paymentSessions[0],
            expiresAt: transaction.paymentSessions[0].expiresAt?.toISOString() ?? null,
          }
        : null,
    })),
  };
}

export async function createManualTransaction(userId: string, input: TransactionInput) {
  const business = await requireBusinessForUser(userId);
  const transactionType = input.transactionType ?? TransactionType.EXPENSE;
  const category = await upsertCategory(business.id, input.categoryName, transactionType);
  const project = await upsertProject(business.id, input.projectName);
  const product = input.productId
    ? await prisma.product.findFirst({
        where: { id: input.productId, businessId: business.id, isActive: true },
        select: { id: true, name: true, price: true },
      })
    : null;

  if (input.productId && !product) {
    throw new Error("Produk tidak ditemukan atau sudah nonaktif.");
  }

  const quantity = Math.min(10_000, Math.max(1, Math.floor(input.quantity ?? 1)));
  const baseAmount = product ? Number(product.price) * quantity : input.totalAmount;
  const totalAmount = Math.max(
    0,
    baseAmount - Math.max(0, input.discount ?? 0) + Math.max(0, input.shipping ?? 0) + Math.max(0, input.vat ?? 0),
  );

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Total order harus lebih dari 0.");
  }

  const description = buildTransactionDescription(input, product?.name);

  const transaction = await prisma.transaction.create({
    data: {
      businessId: business.id,
      userId,
      transactionType,
      transactionDate: parseDate(input.transactionDate),
      merchantName: cleanOptional(input.merchantName),
      categoryId: category?.id,
      projectId: project?.id,
      totalAmount: String(totalAmount),
      description,
      source: TransactionSource.DASHBOARD_MANUAL,
      status: input.status ?? TransactionStatus.CONFIRMED,
      confidenceScore: "1",
      items: product
        ? {
            create: {
              itemName: product.name,
              quantity: String(quantity),
              unitPrice: product.price,
              subtotal: String(Number(product.price) * quantity),
            },
          }
        : undefined,
    },
  });

  await writeAuditLog({
    businessId: business.id,
    actorId: userId,
    entityId: transaction.id,
    action: "transaction_created",
    afterJson: transaction,
  });

  return transaction;
}

export async function updateTransaction(userId: string, transactionId: string, input: TransactionInput) {
  const business = await requireBusinessForUser(userId);
  const existing = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      businessId: business.id,
    },
  });

  if (!existing) {
    throw new Error("Transaction not found.");
  }

  const transactionType = input.transactionType ?? existing.transactionType;
  const category = await upsertCategory(business.id, input.categoryName, transactionType);
  const project = await upsertProject(business.id, input.projectName);

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      transactionDate: parseDate(input.transactionDate),
      merchantName: cleanOptional(input.merchantName),
      categoryId: category?.id,
      projectId: project?.id,
      totalAmount: String(input.totalAmount),
      description: cleanOptional(input.description),
      transactionType,
      status: input.status ?? existing.status,
    },
  });

  await writeAuditLog({
    businessId: business.id,
    actorId: userId,
    entityId: transactionId,
    action: "transaction_updated",
    beforeJson: existing,
    afterJson: updated,
  });

  return updated;
}

export async function deleteTransaction(userId: string, transactionId: string) {
  const business = await requireBusinessForUser(userId);
  const existing = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      businessId: business.id,
    },
  });

  if (!existing) {
    throw new Error("Transaction not found.");
  }

  await prisma.transaction.delete({
    where: { id: transactionId },
  });

  await writeAuditLog({
    businessId: business.id,
    actorId: userId,
    entityId: transactionId,
    action: "transaction_deleted",
    beforeJson: existing,
  });
}

export async function buildTransactionsCsv(userId: string, filters: TransactionFilters) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return "Date,Merchant,Category,Project,Description,Amount,Status,Source";
  }

  const transactions = await prisma.transaction.findMany({
    where: buildTransactionWhere(business.id, filters),
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    select: {
      transactionDate: true,
      merchantName: true,
      description: true,
      totalAmount: true,
      status: true,
      source: true,
      category: { select: { name: true } },
      project: { select: { projectName: true } },
    },
  });
  const rows = [
    ["Date", "Merchant", "Category", "Project", "Description", "Amount", "Status", "Source"],
    ...transactions.map((transaction) => [
      transaction.transactionDate.toISOString().slice(0, 10),
      transaction.merchantName ?? "",
      transaction.category?.name ?? "",
      transaction.project?.projectName ?? "",
      transaction.description ?? "",
      transaction.totalAmount.toString(),
      transaction.status,
      transaction.source,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function parseTransactionFilters(params: Record<string, string | string[] | undefined>) {
  return {
    status: getSingleParam(params.status),
    transactionType: getSingleParam(params.transactionType),
    categoryId: getSingleParam(params.categoryId),
    projectId: getSingleParam(params.projectId),
    dateFrom: getSingleParam(params.dateFrom),
    dateTo: getSingleParam(params.dateTo),
    q: getSingleParam(params.q),
    page: parsePositiveInteger(getSingleParam(params.page), 1),
    pageSize: parsePositiveInteger(getSingleParam(params.pageSize), 25),
  } satisfies TransactionFilters;
}

export function parseTransactionFormData(formData: FormData) {
  const productId = String(formData.get("productId") ?? "").trim();
  const totalAmount = parseMoney(formData.get("totalAmount"));

  if (!productId && (!Number.isFinite(totalAmount) || totalAmount <= 0)) {
    throw new Error("Nominal transaksi harus lebih dari 0.");
  }

  return {
    transactionDate: String(formData.get("transactionDate") ?? ""),
    merchantName: String(formData.get("merchantName") ?? ""),
    customerPhone: String(formData.get("customerPhone") ?? ""),
    address: String(formData.get("address") ?? ""),
    categoryName: String(formData.get("categoryName") ?? ""),
    projectName: String(formData.get("projectName") ?? ""),
    totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
    description: String(formData.get("description") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    productId,
    quantity: parsePositiveInteger(String(formData.get("quantity") ?? ""), 1),
    discount: Math.max(0, parseMoney(formData.get("discount")) || 0),
    shipping: Math.max(0, parseMoney(formData.get("shipping")) || 0),
    vat: Math.max(0, parseMoney(formData.get("vat")) || 0),
    transactionType: parseTransactionType(String(formData.get("transactionType") ?? "")),
    status: parseTransactionStatus(String(formData.get("status") ?? "")),
  } satisfies TransactionInput;
}

export function parseTransactionJsonBody(body: Record<string, unknown>) {
  const totalAmount = Number(body.totalAmount);

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Nominal transaksi harus lebih dari 0.");
  }

  return {
    transactionDate: String(body.transactionDate ?? ""),
    merchantName: typeof body.merchantName === "string" ? body.merchantName : "",
    customerPhone: typeof body.customerPhone === "string" ? body.customerPhone : "",
    address: typeof body.address === "string" ? body.address : "",
    categoryName: typeof body.categoryName === "string" ? body.categoryName : "",
    projectName: typeof body.projectName === "string" ? body.projectName : "",
    totalAmount,
    description: typeof body.description === "string" ? body.description : "",
    notes: typeof body.notes === "string" ? body.notes : "",
    productId: typeof body.productId === "string" ? body.productId : "",
    quantity: Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : 1,
    discount: Number.isFinite(Number(body.discount)) ? Number(body.discount) : 0,
    shipping: Number.isFinite(Number(body.shipping)) ? Number(body.shipping) : 0,
    vat: Number.isFinite(Number(body.vat)) ? Number(body.vat) : 0,
    transactionType: parseTransactionType(typeof body.transactionType === "string" ? body.transactionType : ""),
    status: parseTransactionStatus(typeof body.status === "string" ? body.status : ""),
  } satisfies TransactionInput;
}

export function formatTransactionStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTransactionSource(source: string) {
  return source
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatAmountForInput(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

export function buildExportUrl(filters: TransactionFilters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, String(value));
    }
  }

  return `/api/transactions/export${params.size > 0 ? `?${params.toString()}` : ""}`;
}

function buildTransactionWhere(businessId: string, filters: TransactionFilters) {
  const where: Prisma.TransactionWhereInput = { businessId };

  if (filters.status && isTransactionStatus(filters.status)) {
    where.status = filters.status;
  }

  if (filters.transactionType && isTransactionType(filters.transactionType)) {
    where.transactionType = filters.transactionType;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.projectId) {
    where.projectId = filters.projectId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.transactionDate = {
      ...(filters.dateFrom ? { gte: parseDate(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: parseDate(filters.dateTo) } : {}),
    };
  }

  if (filters.q) {
    where.OR = [
      { merchantName: { contains: filters.q, mode: "insensitive" } },
      { description: { contains: filters.q, mode: "insensitive" } },
      { category: { name: { contains: filters.q, mode: "insensitive" } } },
      { project: { projectName: { contains: filters.q, mode: "insensitive" } } },
    ];
  }

  return where;
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

async function upsertCategory(
  businessId: string,
  categoryName: string | undefined,
  transactionType: TransactionType,
) {
  const name = cleanOptional(categoryName);

  if (!name) {
    return null;
  }

  const categoryType = transactionType === TransactionType.INCOME ? CategoryType.INCOME : CategoryType.EXPENSE;

  return prisma.category.upsert({
    where: {
      businessId_name_type: {
        businessId,
        name,
        type: categoryType,
      },
    },
    update: {},
    create: {
      businessId,
      name,
      type: categoryType,
    },
  });
}

async function upsertProject(businessId: string, projectName?: string) {
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

async function writeAuditLog(params: {
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
      entityType: "transaction",
      entityId: params.entityId,
      action: params.action,
      beforeJson: toJson(params.beforeJson),
      afterJson: toJson(params.afterJson),
    },
  });
}

function parseTransactionStatus(status: string) {
  return isTransactionStatus(status) ? status : TransactionStatus.CONFIRMED;
}

function parseTransactionType(value: string) {
  return isTransactionType(value) ? value : TransactionType.EXPENSE;
}

function isTransactionType(value: string): value is TransactionType {
  return Object.values(TransactionType).includes(value as TransactionType);
}

function isTransactionStatus(status: string): status is TransactionStatus {
  return Object.values(TransactionStatus).includes(status as TransactionStatus);
}

function parseDate(value: string) {
  if (!value) {
    throw new Error("Tanggal transaksi wajib diisi.");
  }

  return new Date(`${value}T00:00:00.000Z`);
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function escapeCsvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;

  if (!/[",\n]/.test(safeValue)) {
    return safeValue;
  }

  return `"${safeValue.replace(/"/g, '""')}"`;
}

function toJson(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function emptyTransactionsPage() {
  return {
    business: null,
    summary: {
      totalConfirmedThisMonth: 0,
      totalPending: 0,
      totalNeedsReview: 0,
      filteredCount: 0,
      confirmedCount: 0,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    },
    categories: [],
    projects: [],
    products: [],
    transactions: [],
  };
}

function parseMoney(value: FormDataEntryValue | null) {
  return Number(String(value ?? "").replace(/[^\d.-]/g, ""));
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildTransactionDescription(input: TransactionInput, productName?: string) {
  return [
    input.description?.trim() || productName,
    input.customerPhone?.trim() ? `Phone: ${input.customerPhone.trim()}` : null,
    input.address?.trim() ? `Alamat: ${input.address.trim()}` : null,
    input.notes?.trim() ? `Catatan: ${input.notes.trim()}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || null;
}

export { formatCurrencyIDR };
