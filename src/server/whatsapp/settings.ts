import { timingSafeEqual } from "node:crypto";
import { WorkspaceRole } from "@/generated/prisma-beta/client";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secret-encryption";
import { prisma } from "@/lib/prisma";
import {
  readCredentialSnapshot,
  requireCompleteCredentialReplacement,
} from "@/server/integrations/credential-recovery";
import { connectWhatsAppCloudApi } from "@/server/whatsapp/meta-connection";
import { resolveWhatsAppVerifyToken } from "@/server/whatsapp/verify-token";
import { activeWorkspaceAccessWhere, requireWorkspaceAccess } from "@/server/workspace-access";

export type WhatsAppSettingsInput = {
  wabaId?: string | null;
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
      diagnostics: {
        lastInboundAt: null,
        lastOutboundAt: null,
        lastOutboundStatus: null,
        lastOutboundError: null,
        failedMessagesLast24h: 0,
        lastWebhookError: null,
        lastWebhookErrorAt: null,
      },
      ready: false,
    };
  }

  const stored = await prisma.whatsAppSettings.findUnique({ where: { businessId: business.id } });
  const rawSettings = stored ?? {
    businessId: business.id,
    wabaId: null,
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
      "Credential WhatsApp tidak dapat dibaca. Isi ulang WABA ID, Phone Number ID, access token, dan app secret.";
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
  const [lastInbound, lastOutbound, failedLast24h, lastFailedJob] =
    await Promise.all([
      prisma.whatsAppMessage.findFirst({
        where: {
          conversation: { businessId: business.id, channel: "WHATSAPP" },
          senderType: "CUSTOMER",
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.whatsAppMessage.findFirst({
        where: {
          conversation: { businessId: business.id, channel: "WHATSAPP" },
          senderType: { in: ["AI", "USER"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          deliveryStatus: true,
          deliveryError: true,
        },
      }),
      prisma.whatsAppMessage.count({
        where: {
          conversation: { businessId: business.id, channel: "WHATSAPP" },
          deliveryStatus: { in: ["FAILED", "UNKNOWN"] },
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
        },
      }),
      prisma.backgroundJob.findFirst({
        where: {
          businessId: business.id,
          type: "WHATSAPP_WEBHOOK",
          status: "FAILED",
        },
        orderBy: { updatedAt: "desc" },
        select: { lastError: true, updatedAt: true },
      }),
    ]);

  return {
    business,
    configurationIssue,
    settings: {
      wabaId: settings.wabaId,
      phoneNumberId: settings.phoneNumberId,
      webhookUrl: getWhatsAppWebhookUrl(),
      isActive: settings.isActive,
      lastConnectedAt: settings.lastConnectedAt?.toISOString() ?? null,
      accessTokenSet: Boolean(settings.accessToken),
      appSecretSet: Boolean(settings.appSecret),
      accessTokenMasked: maskSecret(settings.accessToken),
      verifyTokenMasked: maskSecret(settings.verifyToken),
      appSecretMasked: maskSecret(settings.appSecret),
      verifyTokenSet: Boolean(settings.verifyToken),
    },
    diagnostics: {
      lastInboundAt: lastInbound?.createdAt.toISOString() ?? null,
      lastOutboundAt: lastOutbound?.createdAt.toISOString() ?? null,
      lastOutboundStatus: lastOutbound?.deliveryStatus ?? null,
      lastOutboundError: lastOutbound?.deliveryError ?? null,
      failedMessagesLast24h: failedLast24h,
      lastWebhookError: lastFailedJob?.lastError ?? null,
      lastWebhookErrorAt: lastFailedJob?.updatedAt.toISOString() ?? null,
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
  const nextWabaId = cleanOptional(input.wabaId);
  const nextPhoneNumberId = cleanOptional(input.phoneNumberId);
  const nextWebhookUrl = getWhatsAppWebhookUrl();
  const incomingAccessToken = cleanOptional(input.accessToken);
  const incomingVerifyToken = cleanOptional(input.verifyToken);
  const incomingAppSecret = cleanOptional(input.appSecret);

  requireCompleteCredentialReplacement(
    credentialSnapshot.recoveryRequired,
    [nextWabaId, nextPhoneNumberId, incomingAccessToken, incomingAppSecret],
    "Credential WhatsApp lama tidak dapat dibaca. Isi ulang WABA ID, Phone Number ID, access token, dan app secret.",
  );

  const nextAccessToken = mergeSecret(existing.accessToken, incomingAccessToken, "access token");
  const nextVerifyToken = resolveWhatsAppVerifyToken({
    existing: existing.verifyToken,
    incoming: incomingVerifyToken,
    isActive: Boolean(input.isActive),
  });
  const nextAppSecret = mergeSecret(existing.appSecret, incomingAppSecret, "app secret");

  if (nextWabaId && !/^\d{5,32}$/.test(nextWabaId)) {
    throw new Error("WABA ID harus berupa angka yang valid.");
  }

  if (nextPhoneNumberId && !/^\d{5,32}$/.test(nextPhoneNumberId)) {
    throw new Error("Phone Number ID harus berupa angka yang valid.");
  }

  if (nextAccessToken && nextAccessToken.length < 20) {
    throw new Error("Access token WhatsApp terlihat tidak valid.");
  }

  if (nextVerifyToken && nextVerifyToken.length < 16) {
    throw new Error("Verify token minimal 16 karakter agar tidak mudah ditebak.");
  }

  if (nextAppSecret && nextAppSecret.length < 16) {
    throw new Error("App secret tidak valid.");
  }

  const ready = Boolean(
    nextAccessToken &&
      nextVerifyToken &&
      nextAppSecret &&
      nextWabaId &&
      nextPhoneNumberId,
  );

  const draft = await prisma.whatsAppSettings.update({
    where: { businessId: business.id },
    data: {
      wabaId: nextWabaId,
      phoneNumberId: nextPhoneNumberId,
      accessToken: encryptSecret(nextAccessToken, secretContext(business.id, "accessToken")),
      verifyToken: encryptSecret(nextVerifyToken, secretContext(business.id, "verifyToken")),
      appSecret: encryptSecret(nextAppSecret, secretContext(business.id, "appSecret")),
      webhookUrl: nextWebhookUrl,
      isActive: false,
      lastConnectedAt: input.isActive ? null : existing.lastConnectedAt,
    },
  });

  if (!input.isActive) {
    return draft;
  }

  if (
    !ready ||
    !nextAccessToken ||
    !nextVerifyToken ||
    !nextAppSecret ||
    !nextWabaId ||
    !nextPhoneNumberId
  ) {
    throw new Error(
      "Lengkapi WABA ID, Phone Number ID, access token, dan app secret sebelum mengaktifkan WhatsApp.",
    );
  }

  const connection = await connectWhatsAppCloudApi({
    accessToken: nextAccessToken,
    appSecret: nextAppSecret,
    wabaId: nextWabaId,
    phoneNumberId: nextPhoneNumberId,
    webhookUrl: nextWebhookUrl,
    verifyToken: nextVerifyToken,
  });

  if (!connection.ok) {
    throw new Error(connection.reason);
  }

  return prisma.whatsAppSettings.update({
    where: { businessId: business.id },
    data: {
      isActive: true,
      lastConnectedAt: new Date(),
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
    where: {
      verifyToken: { not: null },
      OR: [
        { isActive: true },
        { updatedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
      ],
    },
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
      checks: {
        accessToken: false,
        verifyToken: false,
        wabaId: false,
        phoneNumberId: false,
        appSecret: false,
      },
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
      checks: {
        accessToken: false,
        verifyToken: false,
        wabaId: Boolean(stored.wabaId),
        phoneNumberId: Boolean(stored.phoneNumberId),
        appSecret: false,
      },
    };
  }

  return {
    ready: isSettingsReady(settings),
    source: settings.isActive ? "dashboard" : "not_configured",
    checks: {
      accessToken: Boolean(settings.accessToken),
      verifyToken: Boolean(settings.verifyToken),
      wabaId: Boolean(settings.wabaId),
      phoneNumberId: Boolean(settings.phoneNumberId),
      appSecret: Boolean(settings.appSecret),
    },
  };
}

export function parseWhatsAppSettingsFormData(formData: FormData): WhatsAppSettingsInput {
  return {
    wabaId: String(formData.get("wabaId") ?? ""),
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
    where: await activeWorkspaceAccessWhere(userId),
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const access = await requireWorkspaceAccess(userId, [
    WorkspaceRole.OWNER,
    WorkspaceRole.ADMIN,
  ]);
  return { id: access.businessId, businessName: access.businessName };
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
  wabaId: string | null;
  phoneNumberId: string | null;
  accessToken: string | null;
  verifyToken: string | null;
  appSecret: string | null;
  isActive: boolean;
}) {
  return Boolean(
    settings.isActive &&
      settings.wabaId &&
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

export function getWhatsAppWebhookUrl() {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL belum dikonfigurasi untuk webhook WhatsApp.");
  }

  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL tidak valid untuk webhook WhatsApp.");
  }

  url.pathname = "/api/webhooks/whatsapp";
  url.search = "";
  url.hash = "";
  const webhookUrl = url.toString();
  validateWebhookUrl(webhookUrl);
  return webhookUrl;
}
