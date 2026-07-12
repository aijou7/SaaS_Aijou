"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createManualTransaction,
  deleteTransaction,
  parseTransactionFormData,
  updateTransaction,
} from "@/server/finance/transactions";

export async function createTransactionAction(formData: FormData) {
  const session = await getRequiredSession();
  const input = parseTransactionFormData(formData);

  await createManualTransaction(session.userId, input);
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/payments");
  redirect("/transactions?created=1");
}

export async function updateTransactionAction(formData: FormData) {
  const session = await getRequiredSession();
  const transactionId = String(formData.get("transactionId") ?? "");

  if (!transactionId) {
    throw new Error("Transaction ID is required.");
  }

  const input = parseTransactionFormData(formData);

  await updateTransaction(session.userId, transactionId, input);
  revalidatePath("/");
  revalidatePath("/transactions");
}

export async function deleteTransactionAction(formData: FormData) {
  const session = await getRequiredSession();
  const transactionId = String(formData.get("transactionId") ?? "");

  if (!transactionId) {
    throw new Error("Transaction ID is required.");
  }

  await deleteTransaction(session.userId, transactionId);
  revalidatePath("/");
  revalidatePath("/transactions");
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
