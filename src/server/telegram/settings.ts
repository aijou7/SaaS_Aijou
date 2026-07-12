import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, isEncryptedSecret } from "@/lib/secret-encryption";
import {
  deleteTelegramWebhook,
  getTelegramBotIdentity,
  getTelegramWebhookInfo,
  setTelegramWebhook,
} from "@/server/telegram/client";
import {
  hashTelegramWebhookKey,
  isValidTelegramWebhookKey,
} from "@/server/telegram/security";

export type TelegramSettingsInput = {
  botToken?: string | null;
  isActive?: boolean;
};

export async function getTelegramSettingsForUser(userId: string) {
  const business = await getBusinessForUser(userId);
  if (!business) {
    return { business: null, settings: null, readiness: false };
  }

  const stored = await ensureTelegramSettings(business.id);
  const settings = decryptStoredSettings(stored);
  const readiness = isSettingsReady(settings);

  return {
    business,
    settings: {
      botId: settings.botId,
      botUsername: settings.botUsername,
      botTokenMasked: maskSecret(settings.botToken),
      configured: Boolean(settings.botToken),
      webhookUrl: settings.webhookUrl,
      isActive: settings.isActive,
      lastConnectedAt: settings.lastConnectedAt?.toISOString() ?? null,
      lastError: settings.lastError,
    },
    readiness,
  };
}

export const getTelegramSettingsPage = getTelegramSettingsForUser;

export async function getTelegramReadinessForBusiness(businessId: string) {
  const settings = await prisma.telegramSettings.findUnique({
    where: { businessId },
    select: {
      botToken: true,
      botId: true,
      webhookKeyHash: true,
      webhookSecret: true,
      webhookUrl: true,
      isActive: true,
    },
  });

  return {
    ready: Boolean(
      settings?.isActive &&
        settings.botToken &&
        settings.botId &&
        settings.webhookKeyHash &&
        settings.webhookSecret &&
        settings.webhookUrl,
    ),
    source: settings?.isActive ? "dashboard" : "not_configured",
    checks: {
      botToken: Boolean(settings?.botToken),
      botIdentity: Boolean(settings?.botId),
      webhook: Boolean(
        settings?.webhookKeyHash && settings.webhookSecret && settings.webhookUrl,
      ),
    },
  };
}

export async function saveTelegramSettingsForUser(
  userId: string,
  input: TelegramSettingsInput,
) {
  const business = await requireBusinessForUser(userId);
  const stored = await ensureTelegramSettings(business.id);
  const existing = decryptStoredSettings(stored);
  const incomingToken = cleanOptional(input.botToken);
  const botToken = incomingToken ?? existing.botToken;
  const tokenChanged = Boolean(incomingToken && existing.botToken !== incomingToken);

  if (!botToken) throw new Error("Bot token Telegram wajib diisi.");
  validateBotToken(botToken);

  if (input.isActive === false) {
    if (existing.isActive && existing.botToken) {
      const disconnected = await deleteTelegramWebhook(existing.botToken);
      if (!disconnected.ok) {
        await storeLastError(business.id, disconnected.reason);
        throw new Error("Webhook Telegram belum dapat dinonaktifkan. Coba lagi sebentar.");
      }
    }

    const identity = incomingToken ? await requireBotIdentity(botToken) : null;
    return prisma.telegramSettings.update({
      where: { businessId: business.id },
      data: {
        botToken: encryptField(botToken, business.id, "botToken"),
        botId: identity?.id ?? existing.botId,
        botUsername: identity?.username ?? existing.botUsername,
        webhookKey: tokenChanged ? null : stored.webhookKey,
        webhookKeyHash: tokenChanged ? null : stored.webhookKeyHash,
        webhookSecret: tokenChanged ? null : stored.webhookSecret,
        webhookUrl: tokenChanged ? null : stored.webhookUrl,
        isActive: false,
        lastConnectedAt: tokenChanged ? null : existing.lastConnectedAt,
        lastError: null,
      },
    });
  }

  return connectTelegramForUser(userId, incomingToken ?? undefined);
}

export const updateTelegramSettings = saveTelegramSettingsForUser;

export async function connectTelegramForUser(userId: string, replacementToken?: string) {
  const business = await requireBusinessForUser(userId);
  const stored = await ensureTelegramSettings(business.id);
  const existing = decryptStoredSettings(stored);
  const botToken = cleanOptional(replacementToken) ?? existing.botToken;
  if (!botToken) throw new Error("Bot token Telegram wajib diisi.");
  validateBotToken(botToken);

  const identity = await requireBotIdentity(botToken);
  const duplicateBot = await prisma.telegramSettings.findFirst({
    where: { botId: identity.id, businessId: { not: business.id } },
    select: { id: true },
  });
  if (duplicateBot) {
    throw new Error("Bot Telegram ini sudah terhubung ke workspace lain.");
  }

  const tokenChanged = Boolean(existing.botToken && existing.botToken !== botToken);
  if (tokenChanged && existing.isActive && existing.botToken) {
    const disconnected = await deleteTelegramWebhook(existing.botToken);
    if (!disconnected.ok) {
      await storeLastError(business.id, disconnected.reason);
      throw new Error("Webhook bot lama belum dapat dilepas. Coba lagi sebelum mengganti token.");
    }
  }

  // Rotate both webhook factors when the bot changes. The public path is
  // looked up by a one-way hash, while its recoverable value stays encrypted.
  const webhookKey =
    tokenChanged || !existing.webhookKey ? randomBytes(32).toString("base64url") : existing.webhookKey;
  const webhookSecret =
    tokenChanged || !existing.webhookSecret
      ? randomBytes(32).toString("base64url")
      : existing.webhookSecret;
  const webhookUrl = buildTelegramWebhookUrl(webhookKey);

  try {
    await prisma.telegramSettings.update({
      where: { businessId: business.id },
      data: {
        botToken: encryptField(botToken, business.id, "botToken"),
        botId: identity.id,
        botUsername: identity.username,
        webhookKey: encryptField(webhookKey, business.id, "webhookKey"),
        webhookKeyHash: hashTelegramWebhookKey(webhookKey),
        webhookSecret: encryptField(webhookSecret, business.id, "webhookSecret"),
        webhookUrl: encryptField(webhookUrl, business.id, "webhookUrl"),
        isActive: false,
        lastError: null,
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Bot atau webhook Telegram sudah dipakai workspace lain.");
    }
    throw error;
  }

  const connected = await setTelegramWebhook({ botToken, webhookUrl, webhookSecret });
  if (!connected.ok) {
    await storeLastError(business.id, connected.reason);
    throw new Error("Telegram menolak pemasangan webhook. Periksa token dan URL aplikasi.");
  }

  return prisma.telegramSettings.update({
    where: { businessId: business.id },
    data: {
      isActive: true,
      lastConnectedAt: new Date(),
      lastError: null,
    },
  });
}

export async function disconnectTelegramForUser(userId: string) {
  const business = await requireBusinessForUser(userId);
  const settings = decryptStoredSettings(await ensureTelegramSettings(business.id));

  if (settings.botToken) {
    const disconnected = await deleteTelegramWebhook(settings.botToken);
    if (!disconnected.ok) {
      await storeLastError(business.id, disconnected.reason);
      throw new Error("Webhook Telegram belum dapat dilepas. Coba lagi sebentar.");
    }
  }

  return prisma.telegramSettings.update({
    where: { businessId: business.id },
    data: { isActive: false, lastError: null },
  });
}

export async function testTelegramConnectionForUser(userId: string) {
  const business = await requireBusinessForUser(userId);
  const settings = decryptStoredSettings(await ensureTelegramSettings(business.id));
  if (!settings.botToken) throw new Error("Bot token Telegram belum disimpan.");

  const [identity, webhookInfo] = await Promise.all([
    getTelegramBotIdentity(settings.botToken),
    getTelegramWebhookInfo(settings.botToken),
  ]);
  const expectedUrl = settings.webhookUrl ?? "";
  const recentWebhookError = Boolean(
    webhookInfo.ok &&
      webhookInfo.webhook.lastErrorAt &&
      webhookInfo.webhook.lastErrorAt.getTime() > Date.now() - 5 * 60_000,
  );
  const healthy = Boolean(
    identity.ok &&
      webhookInfo.ok &&
      settings.isActive &&
      expectedUrl &&
      webhookInfo.webhook.url === expectedUrl &&
      !recentWebhookError,
  );
  const lastError = !identity.ok
    ? identity.reason
    : !webhookInfo.ok
      ? webhookInfo.reason
      : webhookInfo.webhook.url !== expectedUrl
        ? "telegram_webhook_url_mismatch"
        : recentWebhookError
          ? webhookInfo.webhook.lastErrorMessage
          : null;

  await prisma.telegramSettings.update({
    where: { businessId: business.id },
    data: {
      botId: identity.ok ? identity.bot.id : settings.botId,
      botUsername: identity.ok ? identity.bot.username : settings.botUsername,
      lastConnectedAt: healthy ? new Date() : settings.lastConnectedAt,
      lastError: healthy ? null : String(lastError ?? "telegram_connection_unhealthy").slice(0, 300),
    },
  });

  if (!healthy) {
    throw new Error("Koneksi Telegram belum sehat. Periksa webhook lalu coba lagi.");
  }

  return {
    healthy,
    bot: identity.ok ? identity.bot : null,
    webhook: webhookInfo.ok ? webhookInfo.webhook : null,
    reason: healthy ? null : String(lastError ?? "telegram_connection_unhealthy"),
  };
}

export async function findTelegramWebhookSettingsByKey(webhookKey: string) {
  if (!isValidTelegramWebhookKey(webhookKey)) return null;
  const stored = await prisma.telegramSettings.findUnique({
    where: { webhookKeyHash: hashTelegramWebhookKey(webhookKey) },
    select: {
      businessId: true,
      botId: true,
      webhookSecret: true,
      isActive: true,
    },
  });
  if (!stored?.isActive || !stored.botId || !stored.webhookSecret) return null;

  return {
    businessId: stored.businessId,
    botId: stored.botId,
    webhookSecret: decryptSecret(
      stored.webhookSecret,
      secretContext(stored.businessId, "webhookSecret"),
    ),
  };
}

export async function getTelegramDeliveryCredentialsForBusiness(businessId: string) {
  const stored = await prisma.telegramSettings.findUnique({
    where: { businessId },
    select: { businessId: true, botToken: true, botId: true, isActive: true },
  });
  if (!stored?.isActive || !stored.botToken || !stored.botId) return null;
  return {
    botId: stored.botId,
    botToken: decryptSecret(stored.botToken, secretContext(businessId, "botToken")),
  };
}

export async function getTelegramIdentityForBusiness(businessId: string) {
  return prisma.telegramSettings.findFirst({
    where: { businessId, isActive: true, botId: { not: null } },
    select: { botId: true },
  });
}

export function parseTelegramSettingsFormData(formData: FormData): TelegramSettingsInput {
  return {
    botToken: String(formData.get("botToken") ?? ""),
    isActive: formData.get("isActive") === "on",
  };
}

export function buildTelegramWebhookUrl(webhookKey: string) {
  if (!isValidTelegramWebhookKey(webhookKey)) throw new Error("Webhook key Telegram tidak valid.");
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallback = process.env.NODE_ENV === "production" ? "" : "http://localhost:3000";
  if (!configured && !fallback) {
    throw new Error("NEXT_PUBLIC_APP_URL wajib diisi sebelum mengaktifkan Telegram.");
  }

  let url: URL;
  try {
    url = new URL(configured || fallback);
  } catch {
    throw new Error("NEXT_PUBLIC_APP_URL tidak valid.");
  }
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !localDevelopment) {
    throw new Error("Telegram webhook membutuhkan NEXT_PUBLIC_APP_URL HTTPS.");
  }

  return `${url.origin}/api/webhooks/telegram/${webhookKey}`;
}

async function ensureTelegramSettings(businessId: string) {
  let stored = await prisma.telegramSettings.findUnique({ where: { businessId } });
  if (!stored) {
    try {
      stored = await prisma.telegramSettings.create({
        data: { businessId, isActive: false },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      stored = await prisma.telegramSettings.findUnique({ where: { businessId } });
      if (!stored) throw error;
    }
  }
  return protectStoredSettings(stored);
}

async function protectStoredSettings<
  T extends {
    businessId: string;
    botToken: string | null;
    webhookKey: string | null;
    webhookSecret: string | null;
    webhookUrl: string | null;
  },
>(settings: T) {
  const protectedValues = {
    botToken: protectField(settings.botToken, settings.businessId, "botToken"),
    webhookKey: protectField(settings.webhookKey, settings.businessId, "webhookKey"),
    webhookSecret: protectField(settings.webhookSecret, settings.businessId, "webhookSecret"),
    webhookUrl: protectField(settings.webhookUrl, settings.businessId, "webhookUrl"),
  };
  if (
    protectedValues.botToken !== settings.botToken ||
    protectedValues.webhookKey !== settings.webhookKey ||
    protectedValues.webhookSecret !== settings.webhookSecret ||
    protectedValues.webhookUrl !== settings.webhookUrl
  ) {
    await prisma.telegramSettings.update({
      where: { businessId: settings.businessId },
      data: protectedValues,
    });
  }
  return { ...settings, ...protectedValues };
}

function decryptStoredSettings<
  T extends {
    businessId: string;
    botToken: string | null;
    webhookKey: string | null;
    webhookSecret: string | null;
    webhookUrl: string | null;
  },
>(settings: T) {
  return {
    ...settings,
    botToken: decryptSecret(settings.botToken, secretContext(settings.businessId, "botToken")),
    webhookKey: decryptSecret(settings.webhookKey, secretContext(settings.businessId, "webhookKey")),
    webhookSecret: decryptSecret(
      settings.webhookSecret,
      secretContext(settings.businessId, "webhookSecret"),
    ),
    webhookUrl: decryptSecret(settings.webhookUrl, secretContext(settings.businessId, "webhookUrl")),
  };
}

function isSettingsReady(settings: {
  botToken: string | null;
  botId: string | null;
  webhookKey: string | null;
  webhookSecret: string | null;
  webhookUrl: string | null;
  isActive: boolean;
}) {
  return Boolean(
    settings.isActive &&
      settings.botToken &&
      settings.botId &&
      settings.webhookKey &&
      settings.webhookSecret &&
      settings.webhookUrl,
  );
}

async function requireBotIdentity(botToken: string) {
  const identity = await getTelegramBotIdentity(botToken);
  if (!identity.ok) throw new Error("Bot token Telegram tidak valid atau tidak dapat dihubungi.");
  return identity.bot;
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findFirst({
    where: { userId },
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await getBusinessForUser(userId);
  if (!business) throw new Error("Business belum dibuat. Jalankan onboarding dulu.");
  return business;
}

async function storeLastError(businessId: string, reason: string | null) {
  await prisma.telegramSettings.update({
    where: { businessId },
    data: { lastError: (reason ?? "telegram_unknown_error").slice(0, 300) },
  });
}

function validateBotToken(value: string) {
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(value)) {
    throw new Error("Format bot token Telegram tidak valid.");
  }
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function maskSecret(value: string | null) {
  return value ? `****${value.slice(-4)}` : "Not set";
}

function protectField(value: string | null, businessId: string, field: string) {
  return !value || isEncryptedSecret(value) ? value : encryptField(value, businessId, field);
}

function encryptField(value: string | null, businessId: string, field: string) {
  return encryptSecret(value, secretContext(businessId, field));
}

function secretContext(businessId: string, field: string) {
  return `aijou:telegram:${businessId}:${field}`;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}
