import { normalizeTelegramChatId } from "@/server/telegram/payload";

const telegramApiBaseUrl = "https://api.telegram.org";
const defaultTimeoutMs = 10_000;
const maxResponseBytes = 64 * 1024;
const maxTelegramTextLength = 4_096;

type TelegramApiEnvelope<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
};

export type TelegramBotIdentity = {
  id: string;
  username: string;
  firstName: string;
};

export async function getTelegramBotIdentity(botToken: string) {
  const response = await callTelegramApi<{
    id?: number;
    is_bot?: boolean;
    username?: string;
    first_name?: string;
  }>(botToken, "getMe", {});

  if (!response.ok || !response.result || response.result.is_bot !== true) {
    return { ok: false as const, reason: response.reason, status: response.status };
  }

  const id = normalizeTelegramChatId(String(response.result.id ?? ""));
  const username = response.result.username?.trim() ?? "";
  if (!id || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    return {
      ok: false as const,
      reason: "telegram_bot_identity_invalid",
      status: response.status,
    };
  }

  return {
    ok: true as const,
    bot: {
      id,
      username,
      firstName: (response.result.first_name ?? username).trim().slice(0, 80),
    } satisfies TelegramBotIdentity,
  };
}

export async function setTelegramWebhook(params: {
  botToken: string;
  webhookUrl: string;
  webhookSecret: string;
}) {
  const response = await callTelegramApi<boolean>(params.botToken, "setWebhook", {
    url: params.webhookUrl,
    secret_token: params.webhookSecret,
    allowed_updates: ["message"],
    max_connections: 20,
    drop_pending_updates: false,
  });

  return response.ok && response.result === true
    ? { ok: true as const }
    : { ok: false as const, reason: response.reason, status: response.status };
}

export async function deleteTelegramWebhook(botToken: string) {
  const response = await callTelegramApi<boolean>(botToken, "deleteWebhook", {
    drop_pending_updates: false,
  });
  return response.ok && response.result === true
    ? { ok: true as const }
    : { ok: false as const, reason: response.reason, status: response.status };
}

export async function getTelegramWebhookInfo(botToken: string) {
  const response = await callTelegramApi<{
    url?: string;
    pending_update_count?: number;
    last_error_date?: number;
    last_error_message?: string;
    allowed_updates?: string[];
  }>(botToken, "getWebhookInfo", {});

  if (!response.ok || !response.result) {
    return { ok: false as const, reason: response.reason, status: response.status };
  }

  return {
    ok: true as const,
    webhook: {
      url: response.result.url ?? "",
      pendingUpdateCount: Math.max(0, Number(response.result.pending_update_count) || 0),
      lastErrorAt: response.result.last_error_date
        ? new Date(response.result.last_error_date * 1_000)
        : null,
      lastErrorMessage: response.result.last_error_message?.slice(0, 300) ?? null,
      allowedUpdates: Array.isArray(response.result.allowed_updates)
        ? response.result.allowed_updates.filter((item): item is string => typeof item === "string")
        : [],
    },
  };
}

export async function sendTelegramTextMessage(params: {
  botToken: string;
  chatId: string;
  text: string;
}) {
  const chatId = normalizeTelegramChatId(params.chatId);
  const message = params.text.trim();

  if (!chatId) {
    return { sent: false as const, reason: "telegram_chat_id_invalid", status: null };
  }
  if (!message || message.length > maxTelegramTextLength) {
    return {
      sent: false as const,
      reason: message ? "telegram_message_too_long" : "telegram_message_empty",
      status: null,
    };
  }

  const response = await callTelegramApi<{ message_id?: number }>(
    params.botToken,
    "sendMessage",
    {
      chat_id: chatId,
      text: message,
      link_preview_options: { is_disabled: true },
    },
  );
  const providerMessageId = response.result?.message_id;

  if (
    !response.ok ||
    !Number.isSafeInteger(providerMessageId) ||
    (providerMessageId ?? 0) <= 0
  ) {
    return {
      sent: false as const,
      reason: response.ok ? "telegram_provider_message_id_missing" : response.reason,
      status: response.status,
      retryAfterSeconds: response.retryAfterSeconds,
    };
  }

  return {
    sent: true as const,
    providerMessageId: String(providerMessageId),
    status: response.status,
  };
}

async function callTelegramApi<T>(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
) {
  const normalizedToken = botToken.trim();
  if (!isValidBotToken(normalizedToken)) {
    return {
      ok: false as const,
      reason: "telegram_bot_token_invalid",
      status: null,
      result: null,
      retryAfterSeconds: null,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());

  try {
    const response = await fetch(
      `${telegramApiBaseUrl}/bot${normalizedToken}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    const envelope = await readTelegramResponse<T>(response);

    if (!envelope || !response.ok || envelope.ok !== true) {
      return {
        ok: false as const,
        reason: response.status === 429 ? "telegram_rate_limited" : "telegram_api_rejected",
        status: response.status,
        result: null,
        retryAfterSeconds: boundedRetryAfter(envelope?.parameters?.retry_after),
      };
    }

    return {
      ok: true as const,
      reason: null,
      status: response.status,
      result: envelope.result ?? null,
      retryAfterSeconds: null,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason: isAbortError(error) ? "telegram_request_timeout" : "telegram_network_error",
      status: null,
      result: null,
      retryAfterSeconds: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readTelegramResponse<T>(response: Response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxResponseBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size).toString("utf8")) as TelegramApiEnvelope<T>;
  } catch {
    return null;
  }
}

function isValidBotToken(value: string) {
  return /^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(value);
}

function requestTimeoutMs() {
  const configured = Number(process.env.TELEGRAM_API_TIMEOUT_MS);
  return Number.isFinite(configured)
    ? Math.min(30_000, Math.max(1_000, Math.round(configured)))
    : defaultTimeoutMs;
}

function boundedRetryAfter(value: unknown) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(3_600, Math.max(1, Math.round(seconds))) : null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
