import { prisma } from "@/lib/prisma";

type ProductInput = {
  name: string;
  description?: string;
  price: number;
  isActive?: boolean;
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
  const products = await prisma.product.findMany({
    where: { businessId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    take: 20,
    select: { name: true, description: true, price: true, currency: true },
  });

  if (products.length === 0) {
    return "Belum ada katalog aktif. Jangan mengarang produk, paket, atau harga.";
  }

  return products
    .map((product) => {
      const price = new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: product.currency,
        maximumFractionDigits: 0,
      }).format(Number(product.price));
      return [product.name, product.description, `Harga mulai: ${price}`].filter(Boolean).join(" — ");
    })
    .join("\n");
}

export async function createProduct(userId: string, input: ProductInput) {
  const business = await requireBusinessForUser(userId);
  return prisma.product.create({
    data: {
      businessId: business.id,
      name: input.name.trim(),
      description: cleanOptional(input.description),
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateProduct(userId: string, productId: string, input: ProductInput) {
  const business = await requireBusinessForUser(userId);
  await ensureProductBelongsToBusiness(productId, business.id);

  return prisma.product.update({
    where: { id: productId },
    data: {
      name: input.name.trim(),
      description: cleanOptional(input.description),
      price: input.price,
      isActive: input.isActive ?? true,
    },
  });
}

export async function deleteProduct(userId: string, productId: string) {
  const business = await requireBusinessForUser(userId);
  await ensureProductBelongsToBusiness(productId, business.id);
  await prisma.product.delete({ where: { id: productId } });
}

export function parseProductFormData(formData: FormData): ProductInput {
  const name = String(formData.get("name") ?? "").trim();
  const price = Number(String(formData.get("price") ?? "").replace(/[^0-9.,]/g, "").replace(",", "."));

  if (!name) {
    throw new Error("Nama produk wajib diisi.");
  }

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Harga produk harus lebih dari 0.");
  }

  return {
    name,
    description: String(formData.get("description") ?? ""),
    price,
    isActive: formData.get("isActive") === "on",
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
