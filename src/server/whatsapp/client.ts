import { getWhatsAppCredentialsForBusiness } from "@/server/whatsapp/settings";

type SendTextMessageParams = {
  to: string;
  body: string;
  businessId?: string | null;
};

type DownloadMediaParams = {
  mediaId: string;
  businessId: string;
};

const defaultGraphApiVersion = "v21.0";
const defaultRequestTimeoutMs = 10_000;
const defaultMaxMediaBytes = 10 * 1024 * 1024;
const maxWhatsAppTextLength = 4_096;

export async function sendWhatsAppTextMessage(params: SendTextMessageParams) {
  const credentials = params.businessId
    ? await getWhatsAppCredentialsForBusiness(params.businessId)
    : {
        accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
        phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
      };
  const accessToken = credentials.accessToken;
  const phoneNumberId = credentials.phoneNumberId;
  const recipient = normalizeRecipient(params.to);
  const bodyText = params.body.trim();

  if (!accessToken || !phoneNumberId) {
    return {
      sent: false as const,
      reason: "whatsapp_credentials_missing",
      providerMessageId: null,
    };
  }

  if (!recipient) {
    return {
      sent: false as const,
      reason: "whatsapp_recipient_invalid",
      providerMessageId: null,
    };
  }

  if (!bodyText || bodyText.length > maxWhatsAppTextLength) {
    return {
      sent: false as const,
      reason: !bodyText ? "whatsapp_message_empty" : "whatsapp_message_too_long",
      providerMessageId: null,
    };
  }

  try {
    const response = await fetchWithTimeout(
      graphApiUrl(`${encodeURIComponent(phoneNumberId)}/messages`),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: {
            preview_url: false,
            body: bodyText,
          },
        }),
      },
    );

    const body = await readResponseBody(response);
    const providerMessageId = extractProviderMessageId(body);

    if (!response.ok) {
      return {
        sent: false as const,
        status: response.status,
        reason: "whatsapp_graph_api_rejected",
        providerMessageId: null,
        body,
      };
    }

    // A 2xx without a Meta message id is not proof that Meta accepted the
    // message. Treat it as a failure so callers never persist a false SENT.
    if (!providerMessageId) {
      return {
        sent: false as const,
        status: response.status,
        reason: "whatsapp_provider_message_id_missing",
        providerMessageId: null,
        body,
      };
    }

    return {
      sent: true as const,
      status: response.status,
      providerMessageId,
      body,
    };
  } catch (error) {
    return {
      sent: false as const,
      reason: isAbortError(error) ? "whatsapp_request_timeout" : "whatsapp_network_error",
      providerMessageId: null,
    };
  }
}

export async function getWhatsAppMediaDownloadUrl(mediaId: string, businessId?: string) {
  const credentials = businessId
    ? await getWhatsAppCredentialsForBusiness(businessId)
    : { accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null };
  const accessToken = credentials.accessToken;

  if (!accessToken) {
    return null;
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(graphApiUrl(encodeURIComponent(mediaId)), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    url?: string;
    mime_type?: string;
    file_size?: number;
  } | null;

  if (!body?.url) {
    return null;
  }

  return body;
}

export async function downloadWhatsAppMedia(params: DownloadMediaParams) {
  const credentials = await getWhatsAppCredentialsForBusiness(params.businessId);
  const accessToken = credentials.accessToken;

  if (!accessToken) {
    return {
      downloaded: false,
      reason: "whatsapp_access_token_missing",
    };
  }

  const media = await getWhatsAppMediaDownloadUrl(params.mediaId, params.businessId);

  if (!media?.url) {
    return {
      downloaded: false,
      reason: "media_url_unavailable",
    };
  }

  if (!isSafeMediaDownloadUrl(media.url)) {
    return {
      downloaded: false,
      reason: "media_url_invalid",
    };
  }

  let response: Response;

  try {
    response = await fetchWithTimeout(media.url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    return {
      downloaded: false,
      reason: isAbortError(error) ? "media_download_timeout" : "media_download_failed",
    };
  }

  if (!response.ok) {
    return {
      downloaded: false,
      reason: "media_download_failed",
      status: response.status,
    };
  }

  const advertisedSize = Number(response.headers.get("content-length"));
  const maxMediaBytes = configuredMaxMediaBytes();
  if (Number.isFinite(advertisedSize) && advertisedSize > maxMediaBytes) {
    return {
      downloaded: false,
      reason: "media_file_too_large",
      fileSize: advertisedSize,
    };
  }

  const buffer = await readResponseBufferWithLimit(response, maxMediaBytes);
  if (!buffer) {
    return {
      downloaded: false,
      reason: "media_file_too_large",
    };
  }
  const extension = extensionFromMimeType(media.mime_type);
  const filename = `${safeMediaFilename(params.mediaId)}.${extension}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`receipts/${params.businessId}/${filename}`, buffer, {
      access: "private",
      addRandomSuffix: true,
      contentType: media.mime_type,
    });

    return {
      downloaded: true,
      storagePath: blob.pathname,
      fileUrl: blob.url,
      mimeType: media.mime_type,
      fileSize: media.file_size ?? buffer.byteLength,
      data: buffer,
    };
  }

  if (process.env.NODE_ENV === "production") {
    return {
      downloaded: true,
      storagePath: null,
      fileUrl: null,
      mimeType: media.mime_type,
      fileSize: media.file_size ?? buffer.byteLength,
      data: buffer,
      storageWarning: "BLOB_READ_WRITE_TOKEN is not configured; media is process-only.",
    };
  }

  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const directory = join(process.cwd(), "storage", "receipts", params.businessId);
  const storagePath = join(directory, filename);
  await mkdir(directory, { recursive: true });
  await writeFile(storagePath, buffer);

  return {
    downloaded: true,
    storagePath,
    fileUrl: null,
    mimeType: media.mime_type,
    fileSize: media.file_size ?? buffer.byteLength,
    data: buffer,
  };
}

async function readResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text();
}

async function readResponseBufferWithLimit(response: Response, maxBytes: number) {
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

function extractProviderMessageId(body: unknown) {
  if (!body || typeof body !== "object" || !("messages" in body) || !Array.isArray(body.messages)) {
    return null;
  }

  const firstMessage = body.messages[0];
  if (!firstMessage || typeof firstMessage !== "object" || !("id" in firstMessage)) {
    return null;
  }

  return typeof firstMessage.id === "string" ? firstMessage.id : null;
}

function graphApiUrl(path: string) {
  const configuredVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  const version =
    configuredVersion && /^v?\d+\.\d+$/.test(configuredVersion)
      ? configuredVersion.startsWith("v")
        ? configuredVersion
        : `v${configuredVersion}`
      : defaultGraphApiVersion;
  return `${graphApiBaseUrl()}/${version}/${path.replace(/^\/+/, "")}`;
}

function graphApiBaseUrl() {
  const configured = process.env.WHATSAPP_GRAPH_API_BASE_URL?.trim().replace(/\/+$/, "");

  if (!configured) {
    return "https://graph.facebook.com";
  }

  try {
    const url = new URL(configured);
    const localDevelopmentHost =
      process.env.NODE_ENV !== "production" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (url.protocol === "https:" || (url.protocol === "http:" && localDevelopmentHost)) {
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    // Invalid configuration safely falls back to Meta's official endpoint.
  }

  return "https://graph.facebook.com";
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function requestTimeoutMs() {
  const configured = Number(process.env.WHATSAPP_GRAPH_TIMEOUT_MS);
  if (!Number.isFinite(configured)) {
    return defaultRequestTimeoutMs;
  }

  return Math.min(30_000, Math.max(1_000, Math.round(configured)));
}

function configuredMaxMediaBytes() {
  const configured = Number(process.env.WHATSAPP_MAX_MEDIA_BYTES);
  if (!Number.isFinite(configured)) {
    return defaultMaxMediaBytes;
  }

  return Math.min(25 * 1024 * 1024, Math.max(1024, Math.round(configured)));
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function normalizeRecipient(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("00") ? digits.slice(2) : digits;
  return /^\d{7,15}$/.test(normalized) ? normalized : "";
}

function isSafeMediaDownloadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function safeMediaFilename(mediaId: string) {
  const safe = mediaId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 160);
  return safe || crypto.randomUUID();
}

function extensionFromMimeType(mimeType?: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}
