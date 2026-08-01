import { OrderStatus, ShipmentStatus, WorkspaceRole } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { runWorkflowsForTrigger } from "@/server/operations/workflows";
import { requireWorkspaceAccess } from "@/server/workspace-access";

const roles = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.AGENT];

export async function getOrdersPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, roles);
  const [orders, products, rates, summary] = await Promise.all([
    prisma.order.findMany({
      where: { businessId: access.businessId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true, contact: { select: { displayName: true, phoneNumber: true } } },
    }),
    prisma.product.findMany({ where: { businessId: access.businessId, isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.shippingRate.findMany({ where: { businessId: access.businessId, isActive: true }, orderBy: [{ zoneName: "asc" }, { basePrice: "asc" }] }),
    prisma.order.groupBy({ by: ["status"], where: { businessId: access.businessId }, _count: true, _sum: { totalAmount: true } }),
  ]);
  return { businessId: access.businessId, businessName: access.businessName, orders, products, rates, summary };
}

export async function createOrder(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, roles);
  const productId = clean(formData.get("productId"), 64);
  const quantity = clampInt(formData.get("quantity"), 1, 999, 1);
  const product = productId
    ? await prisma.product.findFirst({ where: { id: productId, businessId: access.businessId, isActive: true } })
    : null;
  const itemName = product?.name ?? clean(formData.get("itemName"), 160);
  const unitPrice = product ? Number(product.price) : money(formData.get("unitPrice"));
  if (!itemName || unitPrice < 0) throw new Error("Item dan harga order wajib diisi.");
  const shippingRateId = clean(formData.get("shippingRateId"), 64);
  const rate = shippingRateId
    ? await prisma.shippingRate.findFirst({ where: { id: shippingRateId, businessId: access.businessId, isActive: true } })
    : null;
  const weightGrams = clampInt(formData.get("weightGrams"), 0, 10_000_000, 0);
  const shippingCost = rate ? Number(rate.basePrice) + Math.ceil(Math.max(1, weightGrams) / 1_000) * Number(rate.pricePerKg) : 0;
  const subtotal = unitPrice * quantity;
  const discountAmount = Math.min(subtotal, money(formData.get("discountAmount"), 0));
  const customerName = clean(formData.get("customerName"), 160);
  if (!customerName) throw new Error("Nama customer wajib diisi.");
  const customerPhone = clean(formData.get("customerPhone"), 40) || null;
  const contact = customerPhone
    ? await prisma.contact.upsert({
        where: { businessId_phoneNumber: { businessId: access.businessId, phoneNumber: customerPhone } },
        update: { displayName: customerName },
        create: { businessId: access.businessId, phoneNumber: customerPhone, displayName: customerName, contactType: "CUSTOMER" },
      })
    : null;
  const now = new Date();
  const orderNumber = `ORD-${now.toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
  const order = await prisma.order.create({
    data: {
      businessId: access.businessId,
      orderNumber,
      contactId: contact?.id,
      customerName,
      customerPhone,
      customerEmail: clean(formData.get("customerEmail"), 180) || null,
      shippingAddress: clean(formData.get("shippingAddress"), 1_000) || null,
      shippingZone: rate?.zoneName ?? null,
      shippingService: rate?.serviceName ?? null,
      weightGrams,
      subtotal,
      shippingCost,
      discountAmount,
      totalAmount: subtotal + shippingCost - discountAmount,
      status: formData.get("confirmNow") === "on" ? OrderStatus.CONFIRMED : OrderStatus.DRAFT,
      shipmentStatus: rate ? ShipmentStatus.QUOTED : ShipmentStatus.PENDING,
      notes: clean(formData.get("notes"), 1_000) || null,
      items: { create: { productId: product?.id, name: itemName, quantity, unitPrice, subtotal } },
    },
  });
  await runWorkflowsForTrigger(access.businessId, "ORDER_CREATED", {
    orderId: order.id,
    contactId: contact?.id ?? null,
    customerName,
    totalAmount: Number(order.totalAmount),
  });
  return order;
}

export async function updateOrderStatus(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, roles);
  const orderId = clean(formData.get("orderId"), 64);
  const status = Object.values(OrderStatus).includes(formData.get("status") as OrderStatus)
    ? (formData.get("status") as OrderStatus)
    : OrderStatus.DRAFT;
  const shipmentStatus = Object.values(ShipmentStatus).includes(formData.get("shipmentStatus") as ShipmentStatus)
    ? (formData.get("shipmentStatus") as ShipmentStatus)
    : ShipmentStatus.PENDING;
  const result = await prisma.order.updateMany({
    where: { id: orderId, businessId: access.businessId },
    data: {
      status,
      shipmentStatus,
      paymentStatus: clean(formData.get("paymentStatus"), 30) || "UNPAID",
      trackingNumber: clean(formData.get("trackingNumber"), 120) || null,
    },
  });
  if (result.count !== 1) throw new Error("Order tidak ditemukan.");
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function clampInt(value: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
function money(value: FormDataEntryValue | null, fallback?: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    if (fallback !== undefined) return fallback;
    throw new Error("Nominal order tidak valid.");
  }
  return Math.round(parsed);
}
