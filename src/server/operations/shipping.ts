import { WorkspaceRole } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAccess } from "@/server/workspace-access";
import { assertWorkspaceFeature } from "@/server/subscriptions/subscriptions";

export type ShippingQuoteInput = {
  id: string;
  zoneName: string;
  serviceName: string;
  minWeightGrams: number;
  maxWeightGrams: number | null;
  basePrice: number;
  pricePerKg: number;
  estimatedDays: string | null;
};

export function calculateShippingQuotes(
  rates: ShippingQuoteInput[],
  zoneName: string,
  weightGrams: number,
) {
  const normalizedZone = zoneName.trim().toLocaleLowerCase("id-ID");
  const safeWeight = Math.max(1, Math.round(weightGrams));
  return rates
    .filter(
      (rate) =>
        rate.zoneName.trim().toLocaleLowerCase("id-ID") === normalizedZone &&
        safeWeight >= rate.minWeightGrams &&
        (rate.maxWeightGrams === null || safeWeight <= rate.maxWeightGrams),
    )
    .map((rate) => ({
      ...rate,
      weightGrams: safeWeight,
      price: Math.max(0, rate.basePrice + Math.ceil(safeWeight / 1_000) * rate.pricePerKg),
    }))
    .sort((a, b) => a.price - b.price);
}

export async function getShippingPage(userId: string, zone?: string, weight?: number) {
  const access = await requireWorkspaceAccess(userId);
  const records = await prisma.shippingRate.findMany({
    where: { businessId: access.businessId },
    orderBy: [{ zoneName: "asc" }, { basePrice: "asc" }],
  });
  const rates = records.map((rate) => ({
    ...rate,
    basePrice: Number(rate.basePrice),
    pricePerKg: Number(rate.pricePerKg),
  }));
  return {
    businessId: access.businessId,
    businessName: access.businessName,
    rates,
    zones: [...new Set(rates.filter((rate) => rate.isActive).map((rate) => rate.zoneName))],
    quotes: zone ? calculateShippingQuotes(rates.filter((rate) => rate.isActive), zone, weight ?? 1_000) : [],
  };
}

export async function createShippingRate(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await assertWorkspaceFeature(access.businessId, "ORDERS");
  const zoneName = clean(formData.get("zoneName"), 100);
  const serviceName = clean(formData.get("serviceName"), 100);
  if (!zoneName || !serviceName) throw new Error("Zona dan layanan pengiriman wajib diisi.");
  return prisma.shippingRate.create({
    data: {
      businessId: access.businessId,
      zoneName,
      serviceName,
      minWeightGrams: integer(formData.get("minWeightGrams"), 0),
      maxWeightGrams: optionalInteger(formData.get("maxWeightGrams")),
      basePrice: money(formData.get("basePrice")),
      pricePerKg: money(formData.get("pricePerKg")),
      estimatedDays: clean(formData.get("estimatedDays"), 80) || null,
      isActive: formData.get("isActive") !== "off",
    },
  });
}

export async function toggleShippingRate(userId: string, rateId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await assertWorkspaceFeature(access.businessId, "ORDERS");
  const rate = await prisma.shippingRate.findFirst({ where: { id: rateId, businessId: access.businessId } });
  if (!rate) throw new Error("Tarif pengiriman tidak ditemukan.");
  await prisma.shippingRate.update({ where: { id: rate.id }, data: { isActive: !rate.isActive } });
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function integer(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}
function optionalInteger(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function money(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Nominal tarif tidak valid.");
  return Math.round(parsed);
}
