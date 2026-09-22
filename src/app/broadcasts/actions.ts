"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createBroadcast, pauseBroadcast, startBroadcast } from "@/server/operations/broadcasts";

function broadcastErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  const knownMessages = new Set([
    "Campaign tidak ditemukan.",
    "Campaign ini sudah berjalan atau selesai.",
    "Hubungkan WhatsApp Cloud API sebelum memulai broadcast.",
    "Tidak ada nomor manual yang siap dikirim. Periksa consent dan cooldown promosi.",
    "Tidak ada penerima yang sudah memberikan opt-in WhatsApp.",
  ]);
  return knownMessages.has(message) ? message : fallback;
}

function redirectWithError(message: string): never {
  redirect(`/broadcasts?error=${encodeURIComponent(message)}`);
}

export async function createBroadcastAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    await createBroadcast(session.userId, formData);
  } catch (error) {
    redirectWithError(broadcastErrorMessage(error, "Draft broadcast belum bisa disimpan. Periksa template dan data penerimanya."));
  }
  revalidatePath("/broadcasts");
  redirect("/broadcasts?created=1");
}

export async function startBroadcastAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    await startBroadcast(session.userId, String(formData.get("campaignId") ?? ""));
  } catch (error) {
    redirectWithError(broadcastErrorMessage(error, "Broadcast belum bisa dimulai. Periksa koneksi WhatsApp dan status penerima."));
  }
  revalidatePath("/broadcasts");
  redirect("/broadcasts?started=1");
}

export async function pauseBroadcastAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  try {
    await pauseBroadcast(session.userId, String(formData.get("campaignId") ?? ""));
  } catch (error) {
    redirectWithError(broadcastErrorMessage(error, "Campaign belum bisa dijeda. Coba lagi sebentar."));
  }
  revalidatePath("/broadcasts");
  redirect("/broadcasts?updated=1");
}
