import { prisma } from "@/lib/prisma";

const DEFAULT_VERIFY_TOKEN = "aijou_verify_2026";

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
      settings: null,
      ready: false,
    };
  }

  const settings = await ensureWhatsAppSettings(business.id);
  const ready = isSettingsReady(settings);

  return {
    business,
    settings: {
      ...settings,
      accessTokenMasked: maskSecret(settings.accessToken),
      verifyTokenMasked: maskSecret(settings.verifyToken),
      appSecretMasked: maskSecret(settings.appSecret),
      lastConnectedAt: settings.lastConnectedAt?.toISOString() ?? null,
    },
    ready,
  };
}

export async function updateWhatsAppSettings(userId: string, input: WhatsAppSettingsInput) {
  const business = await requireBusinessForUser(userId);
  const existing = await ensureWhatsAppSettings(business.id);

  const nextAccessToken = mergeSecret(existing.accessToken, input.accessToken);
  const nextVerifyToken = mergeSecret(existing.verifyToken, input.verifyToken);
  const nextAppSecret = mergeSecret(existing.appSecret, input.appSecret);
  const nextPhoneNumberId = cleanOptional(input.phoneNumberId);

  const ready = Boolean(nextAccessToken && nextVerifyToken && nextAppSecret && nextPhoneNumberId);

  return prisma.whatsAppSettings.update({
    where: { businessId: business.id },
    data: {
      phoneNumberId: nextPhoneNumberId,
      accessToken: nextAccessToken,
      verifyToken: nextVerifyToken,
      appSecret: nextAppSecret,
      webhookUrl: cleanOptional(input.webhookUrl),
      isActive: Boolean(input.isActive && ready),
      lastConnectedAt: input.isActive && ready ? new Date() : existing.lastConnectedAt,
    },
  });
}

export async function getWhatsAppCredentialsForBusiness(businessId: string) {
  const settings = await prisma.whatsAppSettings.findUnique({
    where: { businessId },
    select: {
      phoneNumberId: true,
      accessToken: true,
      verifyToken: true,
      appSecret: true,
      isActive: true,
    },
  });

  if (settings?.isActive && settings.accessToken && settings.phoneNumberId) {
    return settings;
  }

  return getEnvCredentials();
}

export async function isAnyVerifyTokenValid(token: string) {
  const envVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN;

  if (token === envVerifyToken) {
    return true;
  }

  const count = await prisma.whatsAppSettings.count({
    where: {
      isActive: true,
      verifyToken: token,
    },
  });

  return count > 0;
}

export async function getActiveWhatsAppAppSecrets() {
  const settings = await prisma.whatsAppSettings.findMany({
    where: {
      isActive: true,
      appSecret: {
        not: null,
      },
    },
    select: { appSecret: true },
  });
  const secrets = settings.flatMap((setting) => (setting.appSecret ? [setting.appSecret] : []));

  if (process.env.WHATSAPP_APP_SECRET) {
    secrets.push(process.env.WHATSAPP_APP_SECRET);
  }

  return [...new Set(secrets)];
}

export async function findWhatsAppSettingsByIdentifier(identifiers: string[]) {
  if (identifiers.length === 0) {
    return null;
  }

  return prisma.whatsAppSettings.findFirst({
    where: {
      isActive: true,
      phoneNumberId: {
        in: identifiers,
      },
    },
    select: {
      businessId: true,
      phoneNumberId: true,
    },
  });
}

export async function getWhatsAppReadinessForBusiness(businessId: string) {
  const settings = await ensureWhatsAppSettings(businessId);

  return {
    ready: isSettingsReady(settings),
    source: settings.isActive ? "dashboard" : "env",
    checks: {
      accessToken: Boolean(settings.accessToken || process.env.WHATSAPP_ACCESS_TOKEN),
      verifyToken: Boolean(settings.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN),
      phoneNumberId: Boolean(settings.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID),
      appSecret: Boolean(settings.appSecret || process.env.WHATSAPP_APP_SECRET),
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
  return prisma.whatsAppSettings.upsert({
    where: { businessId },
    update: {},
    create: {
      businessId,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
      appSecret: process.env.WHATSAPP_APP_SECRET || null,
      isActive: Boolean(
        process.env.WHATSAPP_ACCESS_TOKEN &&
          process.env.WHATSAPP_VERIFY_TOKEN &&
          process.env.WHATSAPP_PHONE_NUMBER_ID &&
          process.env.WHATSAPP_APP_SECRET,
      ),
    },
  });
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

function getEnvCredentials() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
    appSecret: process.env.WHATSAPP_APP_SECRET || null,
    isActive: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_VERIFY_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_APP_SECRET,
    ),
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

function mergeSecret(existing: string | null, incoming?: string | null) {
  const cleaned = cleanOptional(incoming);

  if (!cleaned) {
    return existing;
  }

  return cleaned;
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function maskSecret(value: string | null) {
  if (!value) {
    return "Not set";
  }

  if (value.length <= 8) {
    return "Set";
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
