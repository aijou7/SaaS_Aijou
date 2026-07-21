import { timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secret-encryption";
import { prisma } from "@/lib/prisma";
import {
  readCredentialSnapshot,
  requireCompleteCredentialReplacement,
} from "@/server/integrations/credential-recovery";

export type WhatsAppSettingsInput = {
  phoneNumberId?: string | null;
  accessToken?: string | null;
  verifyToken?: string | null;
  appSecret?: string | null;
  webhookUrl?: string | null;
  isActive?: boolean;
};

export async function getWhatsAppSettingsPage(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    return {
      business: null,
      configurationIssue: null,
      settings: null,
      ready: false,
    };
  }

  const stored = await prisma.whatsAppSettings.findUnique({ where: { businessId: business.id } });
  const rawSettings = stored ?? {
    businessId: business.id,
    phoneNumberId: null,
    accessToken: null,
    verifyToken: null,
    appSecret: null,
    webhookUrl: null,
    isActive: false,
    lastConnectedAt: null,
  };
  let configurationIssue: string | null = null;
  let settings;
  try {
    settings = decryptStoredSettings(rawSettings);
  } catch {
    configurationIssue =
      "Credential WhatsApp tidak dapat dibaca. Isi ulang Phone Number ID, access token, verify token, dan app secret.";
    settings = {
      ...rawSettings,
      accessToken: null,
      verifyToken: null,
      appSecret: null,
      isActive: false,
    };
    console.error("whatsapp_credentials_decrypt_failed", { businessId: business.id });
  }
  const ready = !configurationIssue && isSettingsReady(settings);

  return {
    business,
    configurationIssue,
    settings: {
      phoneNumberId: settings.phoneNumberId,
      webhookUrl: settings.webhookUrl,
      isActive: settings.isActive,
      lastConnectedAt: settings.lastConnectedAt?.toISOString() ?? null,
      accessTokenMasked: maskSecret(settings.accessToken),
      verifyTokenMasked: maskSecret(settings.verifyToken),
      appSecretMasked: maskSecret(settings.appSecret),
      verifyTokenSet: Boolean(settings.verifyToken),
    },
    ready,
  };
}

export async function updateWhatsAppSettings(userId: string, input: WhatsAppSettingsInput) {
  const business = await requireBusinessForUser(userId);
  const stored = await ensureWhatsAppSettings(business.id);
  const credentialSnapshot = readCredentialSnapshot(
    () => decryptStoredSettings(stored),
    {
      ...stored,
      accessToken: null,
      verifyToken: null,
      appSecret: null,
      isActive: false,
      lastConnectedAt: null,
    },
  );
  const existing = credentialSnapshot.value;
  const nextPhoneNumberId = cleanOptional(input.phoneNumberId);
  const nextWebhookUrl = cleanOptional(input.webhookUrl);
  const incomingAccessToken = cleanOptional(input.accessToken);
  const incomingVerifyToken = cleanOptional(input.verifyToken);
  const incomingAppSecret = cleanOptional(input.appSecret);

  requireCompleteCredentialReplacement(
    credentialSnapshot.recoveryRequired,
    [nextPhoneNumberId, incomingAccessToken, incomingVerifyToken, incomingAppSecret],
    "Credential WhatsApp lama tidak dapat dibaca. Isi ulang Phone Number ID, access token, verify token, dan app secret.",
  );

  const nextAccessToken = mergeSecret(existing.accessToken, incomingAccessToken, "access token");
  const nextVerifyToken = mergeSecret(existing.verifyToken, incomingVerifyToken, "verify token");
  const nextAppSecret = mergeSecret(existing.appSecret, incomingAppSecret, "app secret");

  if (nextPhoneNumberId && !/^\d{5,32}$/.test(nextPhoneNumberId)) {
    throw new Error("Phone Number ID harus berupa angka yang valid.");
  }

  if (nextWebhookUrl) validateWebhookUrl(nextWebhookUrl);

  if (nextAccessToken && nextAccessToken.length < 20) {
    throw new Error("Access token WhatsApp terlihat tidak valid.");
  }

  if (nextVerifyToken && nextVerifyToken.length < 16) {
    throw new Error("Verify token minimal 16 karakter agar tidak mudah ditebak.");
  }

  if (nextAppSecret && nextAppSecret.length < 16) {
    throw new Error("App secret tidak valid.");
  }

  const ready = Boolean(nextAccessToken && nextVerifyToken && nextAppSecret && nextPhoneNumberId);

  return prisma.whatsAppSettings.update({
    where: { businessId: business.id },
    data: {
      phoneNumberId: nextPhoneNumberId,
      accessToken: encryptSecret(nextAccessToken, secretContext(business.id, "accessToken")),
      verifyToken: encryptSecret(nextVerifyToken, secretContext(business.id, "verifyToken")),
      appSecret: encryptSecret(nextAppSecret, secretContext(business.id, "appSecret")),
      webhookUrl: nextWebhookUrl,
      isActive: Boolean(input.isActive && ready),
      lastConnectedAt:
        input.isActive && ready
          ? new Date()
          : credentialSnapshot.recoveryRequired
            ? null
            : existing.lastConnectedAt,
    },
  });
}

export async function getWhatsAppCredentialsForBusiness(businessId: string) {
  const stored = await prisma.whatsAppSettings.findUnique({
    where: { businessId },
    select: {
      businessId: true,
      phoneNumberId: true,
      accessToken: true,
      verifyToken: true,
      appSecret: true,
      isActive: true,
    },
  });

  if (stored) {
    const settings = decryptStoredSettings(await protectStoredSettings(stored));
    if (settings.isActive && settings.accessToken && settings.phoneNumberId) {
      return settings;
    }
  }

  return emptyCredentials();
}

export async function isAnyVerifyTokenValid(token: string) {
  const envVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (envVerifyToken && safeEqual(token, envVerifyToken)) return true;

  const settings = await prisma.whatsAppSettings.findMany({
    where: { isActive: true, verifyToken: { not: null } },
    select: {
      businessId: true,
      accessToken: true,
      verifyToken: true,
      appSecret: true,
    },
  });

  const protectedSettings = await Promise.all(settings.map(protectStoredSettings));

  return protectedSettings.some((setting) => {
    const verifyToken = decryptSecret(
      setting.verifyToken,
      secretContext(setting.businessId, "verifyToken"),
    );
    return Boolean(verifyToken && safeEqual(token, verifyToken));
  });
}

export async function getWhatsAppAppSecretForPhoneNumberId(phoneNumberId: string) {
  const matches = await prisma.whatsAppSettings.findMany({
    where: { isActive: true, phoneNumberId },
    take: 2,
    select: {
      businessId: true,
      accessToken: true,
      verifyToken: true,
      appSecret: true,
    },
  });

  if (matches.length > 1) {
    return null;
  }

  if (matches.length === 1) {
    const settings = await protectStoredSettings(matches[0]);
    return decryptSecret(
      settings.appSecret,
      secretContext(settings.businessId, "appSecret"),
    );
  }

  if (
    process.env.WHATSAPP_PHONE_NUMBER_ID === phoneNumberId &&
    process.env.WHATSAPP_APP_SECRET
  ) {
    return process.env.WHATSAPP_APP_SECRET;
  }

  return null;
}

export async function findWhatsAppSettingsByIdentifier(identifiers: string[]) {
  if (identifiers.length === 0) return null;

  const matches = await prisma.whatsAppSettings.findMany({
    where: {
      isActive: true,
      phoneNumberId: { in: identifiers },
    },
    take: 2,
    select: {
      businessId: true,
      phoneNumberId: true,
    },
  });

  return matches.length === 1 ? matches[0] : null;
}

export async function getWhatsAppReadinessForBusiness(businessId: string) {
  const stored = await prisma.whatsAppSettings.findUnique({ where: { businessId } });
  if (!stored) {
    return {
      ready: false,
      source: "not_configured",
      checks: { accessToken: false, verifyToken: false, phoneNumberId: false, appSecret: false },
    };
  }

  let settings;
  try {
    settings = decryptStoredSettings(stored);
  } catch {
    console.error("whatsapp_credentials_decrypt_failed", { businessId });
    return {
      ready: false,
      source: "credential_error",
      checks: { accessToken: false, verifyToken: false, phoneNumberId: Boolean(stored.phoneNumberId), appSecret: false },
    };
  }

  return {
    ready: isSettingsReady(settings),
    source: settings.isActive ? "dashboard" : "not_configured",
    checks: {
      accessToken: Boolean(settings.accessToken),
      verifyToken: Boolean(settings.verifyToken),
      phoneNumberId: Boolean(settings.phoneNumberId),
      appSecret: Boolean(settings.appSecret),
    },
  };
}

export function parseWhatsAppSettingsFormData(formData: FormData): WhatsAppSettingsInput {
  return {
    phoneNumberId: String(formData.get("phoneNumberId") ?? ""),
    accessToken: String(formData.get("accessToken") ?? ""),
    verifyToken: String(formData.get("verifyToken") ?? ""),
    appSecret: String(formData.get("appSecret") ?? ""),
    webhookUrl: String(formData.get("webhookUrl") ?? ""),
    isActive: formData.get("isActive") === "on",
  };
}

async function ensureWhatsAppSettings(businessId: string) {
  const stored = await prisma.whatsAppSettings.upsert({
    where: { businessId },
    update: {},
    create: {
      businessId,
      isActive: false,
    },
  });

  return protectStoredSettings(stored);
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await getBusinessForUser(userId);

  if (!business) {
    throw new Error("Business belum dibuat. Jalankan seed database dulu.");
  }

  return business;
}

function decryptStoredSettings<T extends {
  businessId: string;
  accessToken: string | null;
  verifyToken: string | null;
  appSecret: string | null;
}>(settings: T) {
  return {
    ...settings,
    accessToken: decryptSecret(
      settings.accessToken,
      secretContext(settings.businessId, "accessToken"),
    ),
    verifyToken: decryptSecret(
      settings.verifyToken,
      secretContext(settings.businessId, "verifyToken"),
    ),
    appSecret: decryptSecret(
      settings.appSecret,
      secretContext(settings.businessId, "appSecret"),
    ),
  };
}

function emptyCredentials() {
  return {
    phoneNumberId: null,
    accessToken: null,
    verifyToken: null,
    appSecret: null,
    isActive: false,
  };
}

function isSettingsReady(settings: {
  phoneNumberId: string | null;
  accessToken: string | null;
  verifyToken: string | null;
  appSecret: string | null;
  isActive: boolean;
}) {
  return Boolean(
    settings.isActive &&
      settings.phoneNumberId &&
      settings.accessToken &&
      settings.verifyToken &&
      settings.appSecret,
  );
}

function mergeSecret(existing: string | null, incoming: string | null | undefined, label: string) {
  const cleaned = cleanOptional(incoming);
  if (!cleaned) return existing;
  if (cleaned.length > 4_096) throw new Error(`${label} terlalu panjang.`);
  return cleaned;
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function protectStoredSettings<T extends {
  businessId: string;
  accessToken: string | null;
  verifyToken: string | null;
  appSecret: string | null;
}>(settings: T) {
  const accessToken = protectSecret(
    settings.accessToken,
    secretContext(settings.businessId, "accessToken"),
  );
  const verifyToken = protectSecret(
    settings.verifyToken,
    secretContext(settings.businessId, "verifyToken"),
  );
  const appSecret = protectSecret(
    settings.appSecret,
    secretContext(settings.businessId, "appSecret"),
  );

  if (
    accessToken !== settings.accessToken ||
    verifyToken !== settings.verifyToken ||
    appSecret !== settings.appSecret
  ) {
    await prisma.whatsAppSettings.update({
      where: { businessId: settings.businessId },
      data: { accessToken, verifyToken, appSecret },
    });
  }

  return { ...settings, accessToken, verifyToken, appSecret };
}

function protectSecret(value: string | null, context: string) {
  if (!value || isEncryptedSecret(value)) return value;
  return encryptSecret(value, context);
}

function maskSecret(value: string | null) {
  if (!value) return "Not set";
  if (value.length <= 4) return "Set";
  return `••••${value.slice(-4)}`;
}

function secretContext(businessId: string, field: string) {
  return `aijou:whatsapp:${businessId}:${field}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateWebhookUrl(value: string) {
  if (value.length > 500) throw new Error("Webhook URL terlalu panjang.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Webhook URL tidak valid.");
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && isLocal)) {
    throw new Error("Webhook URL production wajib menggunakan HTTPS.");
  }
}
