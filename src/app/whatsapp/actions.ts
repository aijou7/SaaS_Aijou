"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  parseWhatsAppSettingsFormData,
  updateWhatsAppSettings,
} from "@/server/whatsapp/settings";

export async function updateWhatsAppSettingsAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const returnTo = getWhatsAppReturnPath(formData);
  const input = parseWhatsAppSettingsFormData(formData);

  try {
    await updateWhatsAppSettings(session.userId, input);
  } catch (error) {
    const errorCode = getWhatsAppErrorCode(error);

    console.error("whatsapp_settings_update_failed", {
      errorCode,
      errorName: error instanceof Error ? error.name : "unknown",
    });

    redirect(`${returnTo}${separator(returnTo)}error=${errorCode}`);
  }

  revalidateWhatsAppPages();
  redirect(`${returnTo}${separator(returnTo)}saved=1&connected=${input.isActive ? "1" : "0"}`);
}

function revalidateWhatsAppPages() {
  revalidatePath("/whatsapp");
  revalidatePath("/integrations");
  revalidatePath("/conversations");
  revalidatePath("/readiness");
  revalidatePath("/setup");
}

function getWhatsAppReturnPath(formData: FormData) {
  const requested = String(formData.get("returnTo") ?? "");
  const allowed = new Set([
    "/whatsapp",
    "/integrations?platform=whatsapp",
  ]);
  return allowed.has(requested) ? requested : "/whatsapp";
}

function separator(path: string) {
  return path.includes("?") ? "&" : "?";
}

function getWhatsAppErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const providerCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "";

  if (providerCode === "P2002") {
    return "phone_in_use";
  }

  if (["P1001", "P1002", "P1008", "P1017"].includes(providerCode)) {
    return "storage_unavailable";
  }

  if (message.includes("data_encryption_key")) {
    return "encryption_unavailable";
  }

  if (message.includes("credential whatsapp lama")) {
    return "credential_recovery";
  }

  if (message.includes("lengkapi") || message.includes("app secret")) {
    return "incomplete";
  }

  if (message.includes("meta_invalid_token") || message.includes("access token")) {
    return "invalid_token";
  }

  if (message.includes("meta_app_secret_mismatch")) {
    return "invalid_app_secret";
  }

  if (message.includes("meta_permission_missing")) {
    return "permission_missing";
  }

  if (message.includes("meta_waba_not_found") || message.includes("waba id")) {
    return "invalid_waba";
  }

  if (message.includes("meta_phone_number_mismatch") || message.includes("phone number id")) {
    return "phone_mismatch";
  }

  if (
    message.includes("meta_webhook_subscription_failed") ||
    message.includes("meta_invalid_response") ||
    message.includes("webhook")
  ) {
    return "webhook_failed";
  }

  if (
    message.includes("meta_unavailable") ||
    message.includes("network") ||
    message.includes("timeout")
  ) {
    return "meta_unavailable";
  }

  if (message.includes("verify token")) {
    return "invalid_verify_token";
  }

  return "save_failed";
}
