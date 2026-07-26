const defaultGraphApiVersion = "v25.0";
const defaultRequestTimeoutMs = 10_000;

export function whatsAppGraphApiUrl(path: string) {
  const configuredVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  const version =
    configuredVersion && /^v?\d+\.\d+$/.test(configuredVersion)
      ? configuredVersion.startsWith("v")
        ? configuredVersion
        : `v${configuredVersion}`
      : defaultGraphApiVersion;

  return `${graphApiBaseUrl()}/${version}/${path.replace(/^\/+/, "")}`;
}

export async function fetchWhatsAppGraph(input: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs());

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readWhatsAppGraphResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => "");
}

export function isWhatsAppAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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

function requestTimeoutMs() {
  const configured = Number(process.env.WHATSAPP_GRAPH_TIMEOUT_MS);
  if (!Number.isFinite(configured)) {
    return defaultRequestTimeoutMs;
  }

  return Math.min(30_000, Math.max(1_000, Math.round(configured)));
}
