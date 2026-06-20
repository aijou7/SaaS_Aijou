"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  confirmReceiptReview,
  parseReceiptReviewFormData,
  rejectReceiptReview,
} from "@/server/receipts/receipt-flow";

export async function confirmReceiptReviewAction(formData: FormData) {
  const session = await getRequiredSession();
  const receiptId = String(formData.get("receiptId") ?? "");

  if (!receiptId) {
    throw new Error("Receipt ID is required.");
  }

  const input = parseReceiptReviewFormData(formData);

  await confirmReceiptReview(session.userId, receiptId, input);
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/receipts");
}

export async function rejectReceiptReviewAction(formData: FormData) {
  const session = await getRequiredSession();
  const receiptId = String(formData.get("receiptId") ?? "");

  if (!receiptId) {
    throw new Error("Receipt ID is required.");
  }

  await rejectReceiptReview(session.userId, receiptId);
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/receipts");
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
