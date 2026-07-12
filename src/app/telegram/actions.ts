"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  disconnectTelegramForUser,
  saveTelegramSettingsForUser,
  testTelegramConnectionForUser,
} from "@/server/telegram/settings";

const telegramSettingsPath = "/integrations?platform=telegram";

export async function saveTelegramSettingsAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    await saveTelegramSettingsForUser(session.userId, {
      botToken: String(formData.get("botToken") ?? ""),
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    redirectWithTelegramError(error);
  }

  revalidateTelegramPages();
  redirect(`${telegramSettingsPath}&saved=1`);
}

export async function testTelegramConnectionAction() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    await testTelegramConnectionForUser(session.userId);
  } catch (error) {
    redirectWithTelegramError(error);
  }

  revalidateTelegramPages();
  redirect(`${telegramSettingsPath}&tested=1`);
}

export async function disconnectTelegramAction() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  try {
    await disconnectTelegramForUser(session.userId);
  } catch (error) {
    redirectWithTelegramError(error);
  }

  revalidateTelegramPages();
  redirect(`${telegramSettingsPath}&disconnected=1`);
}

function revalidateTelegramPages() {
  revalidatePath("/integrations");
  revalidatePath("/conversations");
  revalidatePath("/readiness");
}

function redirectWithTelegramError(error: unknown): never {
  const code = getTelegramErrorCode(error);
  redirect(`${telegramSettingsPath}&error=${code}`);
}

function getTelegramErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("token") || message.includes("unauthorized") || message.includes("401")) {
    return "invalid_token";
  }

  if (message.includes("webhook") || message.includes("https")) {
    return "webhook_failed";
  }

  if (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("unavailable")
  ) {
    return "telegram_unavailable";
  }

  if (message.includes("aktif") || message.includes("active") || message.includes("belum")) {
    return "incomplete";
  }

  return "save_failed";
}
