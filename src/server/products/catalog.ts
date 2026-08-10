import { WorkspaceRole } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  buildActiveProductPromptContext,
  type PublicCatalogItem,
} from "@/lib/customer-pricing";
import { invalidateTtlCache, ttlCache } from "@/lib/ttl-cache";
import { activeWorkspaceAccessWhere, requireWorkspaceAccess } from "@/server/workspace-access";

type ProductInput = {
  name: string;
  description?: string;
  price: number;
  isActive?: boolean;
};

export type ActiveProductCatalogItem = PublicCatalogItem;

type ActiveProductCatalog = {
  items: ActiveProductCatalogItem[];
  context: string;
};

export async function getProductsPage(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return { business: null, products: [] };
  }

  const products = await prisma.product.findMany({
    where: { businessId: business.id },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      description: true,
      price: true,
      currency: true,
      isActive: true,
    },
  });

  return {
    business,
    products: products.map((product) => ({ ...product, price: Number(product.price) })),
  };
}

export async function getActiveProductContext(businessId: string) {
  return (await getActiveProductCatalog(businessId)).context;
}

export async function getActiveProductCatalog(businessId: string) {
  return ttlCache(`product-catalog:${businessId}`, 60_000, () =>
    getActiveProductCatalogFresh(businessId),
  );
}

async function getActiveProductCatalogFresh(
  businessId: string,
): Promise<ActiveProductCatalog> {
  const products = await prisma.product.findMany({
    where: { businessId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: 50,
    select: { name: true, description: true, price: true, currency: true },
  });

  if (products.length === 0) {
    return {
      items: [],
      context: "Belum ada katalog aktif. Jangan mengarang produk, paket, atau harga.",
    };
  }

  const items = products.map((product) => ({
    ...product,
    price: Number(product.price),
  }));

  return {
    items,
    context: buildActiveProductPromptContext(items),
  };
}

export async function createProduct(userId: string, input: ProductInput) {
  const business = await requireBusinessForUser(userId);
  const product = await prisma.product.create({
    data: {
      businessId: business.id,
      name: input.name.trim(),
      description: cleanOptional(input.description),
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });
  invalidateProductCatalog(business.id);
  return product;
}

export async function updateProduct(userId: string, productId: string, input: ProductInput) {
  const business = await requireBusinessForUser(userId);
  await ensureProductBelongsToBusiness(productId, business.id);
  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      name: input.name.trim(),
      description: cleanOptional(input.description),
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });
  invalidateProductCatalog(business.id);
  return product;
}

export async function deleteProduct(userId: string, productId: string) {
  const business = await requireBusinessForUser(userId);
  await ensureProductBelongsToBusiness(productId, business.id);

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: false },
  });
  invalidateProductCatalog(business.id);
}

export function parseProductFormData(formData: FormData): ProductInput {
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));

  if (!name) {
    throw new Error("Nama produk wajib diisi.");
  }

  if (name.length > 120) {
    throw new Error("Nama produk maksimal 120 karakter.");
  }

  const description = String(formData.get("description") ?? "").trim();
  if (description.length > 1_000) {
    throw new Error("Deskripsi produk maksimal 1000 karakter.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga produk harus lebih dari 0.");
  }

  return {
    name,
    description,
    price,
    isActive: formData.get("isActive") === "on",
  };
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: await activeWorkspaceAccessWhere(userId),
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  return { id: access.businessId, businessName: access.businessName };
}

async function ensureProductBelongsToBusiness(productId: string, businessId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, businessId },
    select: { id: true },
  });
  if (!product) {
    throw new Error("Produk tidak ditemukan.");
  }
}

function cleanOptional(value?: string) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}

function invalidateProductCatalog(businessId: string) {
  invalidateTtlCache(`product-catalog:${businessId}`);
  invalidateTtlCache(`product-context:${businessId}`);
}
