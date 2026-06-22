"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createProduct,
  deleteProduct,
  parseProductFormData,
  updateProduct,
} from "@/server/products/catalog";

export async function createProductAction(formData: FormData) {
  const session = await getRequiredSession();
  await createProduct(session.userId, parseProductFormData(formData));
  revalidateProductPaths();
}

export async function updateProductAction(formData: FormData) {
  const session = await getRequiredSession();
  const productId = String(formData.get("productId") ?? "");
  await updateProduct(session.userId, productId, parseProductFormData(formData));
  revalidateProductPaths();
}

export async function deleteProductAction(formData: FormData) {
  const session = await getRequiredSession();
  const productId = String(formData.get("productId") ?? "");
  await deleteProduct(session.userId, productId);
  revalidateProductPaths();
}

async function getRequiredSession() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}

function revalidateProductPaths() {
  revalidatePath("/products");
  revalidatePath("/training");
  revalidatePath("/simulator");
  revalidatePath("/conversations");
}
