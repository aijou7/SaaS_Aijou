"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createComplaint, updateComplaint } from "@/server/operations/complaints";

export async function createComplaintAction(formData: FormData) {
  const session = await getSession(); if (!session) redirect("/login");
  await createComplaint(session.userId, formData); revalidatePath("/complaints"); redirect("/complaints?created=1");
}
export async function updateComplaintAction(formData: FormData) {
  const session = await getSession(); if (!session) redirect("/login");
  await updateComplaint(session.userId, formData); revalidatePath("/complaints"); redirect("/complaints?updated=1");
}
