import {
  ActorType,
  CategoryType,
  Prisma,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma/client";
import { formatCurrencyIDR } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export type TransactionFilters = {
  status?: string;
  categoryId?: string;
  projectId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
};

type TransactionInput = {
  transactionDate: string;
  merchantName?: string;
  categoryName?: string;
  projectName?: string;
  totalAmount: number;
  description?: string;
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

  const [transactions, totalConfirmedThisMonth, totalPending, totalNeedsReview, categories, projects] =
    await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
        take: 100,
        select: {
          id: true,
          transactionDate: true,
          merchantName: true,
          totalAmount: true,
          description: true,
          source: true,
          status: true,
          confidenceScore: true,
          category: { select: { id: true, name: true } },
          project: { select: { id: true, projectName: true } },
        },
      }),
      prisma.transaction.aggregate({
        where: {
          businessId: business.id,
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
        where: { businessId: business.id, type: CategoryType.EXPENSE },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.project.findMany({
        where: { businessId: business.id },
        orderBy: { projectName: "asc" },
        select: { id: true, projectName: true },
      }),
    ]);

  return {
    business,
    summary: {
      totalConfirmedThisMonth: Number(totalConfirmedThisMonth._sum.totalAmount ?? 0),
      totalPending,
      totalNeedsReview,
      filteredCount: transactions.length,
    },
    categories,
    projects,
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      transactionDate: transaction.transactionDate.toISOString().slice(0, 10),
      merchantName: transaction.merchantName ?? "",
      categoryId: transaction.category?.id ?? "",
      categoryName: transaction.category?.name ?? "",
      projectId: transaction.project?.id ?? "",
      projectName: transaction.project?.projectName ?? "",
      totalAmount: Number(transaction.totalAmount),
      description: transaction.description ?? "",
      source: transaction.source,
      status: transaction.status,
      confidenceScore:
        transaction.confidenceScore === null ? null : Number(transaction.confidenceScore),
    })),
  };
}

export async function createManualTransaction(userId: string, input: TransactionInput) {
  const business = await requireBusinessForUser(userId);
  const category = await upsertCategory(business.id, input.categoryName);
  const project = await upsertProject(business.id, input.projectName);

  const transaction = await prisma.transaction.create({
    data: {
      businessId: business.id,
      userId,
      transactionType: TransactionType.EXPENSE,
      transactionDate: parseDate(input.transactionDate),
      merchantName: cleanOptional(input.merchantName),
      categoryId: category?.id,
      projectId: project?.id,
      totalAmount: String(input.totalAmount),
      description: cleanOptional(input.description),
      source: TransactionSource.DASHBOARD_MANUAL,
      status: input.status ?? TransactionStatus.CONFIRMED,
      confidenceScore: "1",
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

  const category = await upsertCategory(business.id, input.categoryName);
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
  const page = await getTransactionsPage(userId, filters);
  const rows = [
    ["Date", "Merchant", "Category", "Project", "Description", "Amount", "Status", "Source"],
    ...page.transactions.map((transaction) => [
      transaction.transactionDate,
      transaction.merchantName,
      transaction.categoryName,
      transaction.projectName,
      transaction.description,
      String(transaction.totalAmount),
      transaction.status,
      transaction.source,
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function parseTransactionFilters(params: Record<string, string | string[] | undefined>) {
  return {
    status: getSingleParam(params.status),
    categoryId: getSingleParam(params.categoryId),
    projectId: getSingleParam(params.projectId),
    dateFrom: getSingleParam(params.dateFrom),
    dateTo: getSingleParam(params.dateTo),
    q: getSingleParam(params.q),
  } satisfies TransactionFilters;
}

export function parseTransactionFormData(formData: FormData) {
  const totalAmount = Number(String(formData.get("totalAmount") ?? "").replace(/[^\d.-]/g, ""));

  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("Nominal transaksi harus lebih dari 0.");
  }

  return {
    transactionDate: String(formData.get("transactionDate") ?? ""),
    merchantName: String(formData.get("merchantName") ?? ""),
    categoryName: String(formData.get("categoryName") ?? ""),
    projectName: String(formData.get("projectName") ?? ""),
    totalAmount,
    description: String(formData.get("description") ?? ""),
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
    categoryName: typeof body.categoryName === "string" ? body.categoryName : "",
    projectName: typeof body.projectName === "string" ? body.projectName : "",
    totalAmount,
    description: typeof body.description === "string" ? body.description : "",
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
      params.set(key, value);
    }
  }

  return `/api/transactions/export${params.size > 0 ? `?${params.toString()}` : ""}`;
}

function buildTransactionWhere(businessId: string, filters: TransactionFilters) {
  const where: Prisma.TransactionWhereInput = { businessId };

  if (filters.status && isTransactionStatus(filters.status)) {
    where.status = filters.status;
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

async function upsertCategory(businessId: string, categoryName?: string) {
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
  if (!/[",\n]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
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
    },
    categories: [],
    projects: [],
    transactions: [],
  };
}

export { formatCurrencyIDR };
