"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createPaymentLinkForTransaction,
  updatePaymentSettings,
} from "@/server/payments/payments";

export async function updatePaymentSettingsAction(formData: FormData) {
  const session = await requireSession();
  await updatePaymentSettings(session.userId, {
    secretKey: String(formData.get("secretKey") ?? ""),
    webhookToken: String(formData.get("webhookToken") ?? ""),
    isActive: formData.get("isActive") === "on",
  });
  revalidatePath("/payments");
  revalidatePath("/transactions");
  revalidatePath("/readiness");
  redirect("/payments?saved=1");
}

export async function createPaymentLinkAction(formData: FormData) {
  const session = await requireSession();
  const transactionId = String(formData.get("transactionId") ?? "").trim();
  if (!transactionId) throw new Error("Order ID wajib diisi.");

  await createPaymentLinkForTransaction(session.userId, transactionId);
  revalidatePath("/payments");
  revalidatePath("/transactions");
  redirect("/transactions?paymentLink=created");
}

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
