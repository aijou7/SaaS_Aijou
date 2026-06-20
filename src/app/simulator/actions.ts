"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  simulateClientChatMessage,
  simulateOwnerFinanceMessage,
} from "@/server/simulator/simulator";

export async function simulateFinanceMessageAction(formData: FormData) {
  const session = await getRequiredSession();
  const message = String(formData.get("message") ?? "");

  await simulateOwnerFinanceMessage(session.userId, message);
  revalidateSimulatorPages();
}

export async function simulateClientMessageAction(formData: FormData) {
  const session = await getRequiredSession();
  const message = String(formData.get("message") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "628123000111");
  const displayName = String(formData.get("displayName") ?? "Bapak Andi");

  await simulateClientChatMessage(session.userId, {
    phoneNumber,
    displayName,
    message,
  });
  revalidateSimulatorPages();
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function revalidateSimulatorPages() {
  revalidatePath("/");
  revalidatePath("/simulator");
  revalidatePath("/conversations");
  revalidatePath("/transactions");
}
