import { NextRequest, NextResponse } from "next/server";

type MutationContentType = "json" | "form" | "urlencoded" | "none";

export const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export function validateMutationRequest(
  request: NextRequest,
  contentType: MutationContentType = "none",
) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-site request ditolak." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const requestContentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const validContentType =
    contentType === "none" ||
    (contentType === "json" && requestContentType.startsWith("application/json")) ||
    (contentType === "urlencoded" &&
      requestContentType.startsWith("application/x-www-form-urlencoded")) ||
    (contentType === "form" &&
      (requestContentType.startsWith("application/x-www-form-urlencoded") ||
        requestContentType.startsWith("multipart/form-data")));

  if (!validContentType) {
    return NextResponse.json(
      { error: "Content-Type tidak didukung." },
      { status: 415, headers: noStoreHeaders },
    );
  }

  return null;
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readRequestBodyBuffer(request: Request, maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("maxBytes must be a positive safe integer.");
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);

    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw new Error("Content-Length is invalid.");
    }

    if (contentLength > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }

  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError();
      }

      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function hasTrustedOrigin(request: NextRequest) {
  const origin = normalizeOrigin(request.headers.get("origin"));
  if (!origin) {
    return process.env.NODE_ENV !== "production";
  }

  return trustedOrigins(request).has(origin);
}

function trustedOrigins(request: NextRequest) {
  const origins = new Set<string>();
  const candidates = [
    request.nextUrl.origin,
    getForwardedRequestOrigin(request),
    process.env.NEXT_PUBLIC_APP_URL,
    toHttpsOrigin(process.env.VERCEL_URL),
    toHttpsOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  ];

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate ?? null);
    if (!origin) continue;

    origins.add(origin);

    const canonicalAlias = getCanonicalWwwAlias(origin);
    if (canonicalAlias) origins.add(canonicalAlias);
  }

  return origins;
}

function getCanonicalWwwAlias(origin: string) {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "localhost" || hostname.includes(":")) return undefined;

    if (hostname.startsWith("www.")) {
      const apexHostname = hostname.slice(4);
      if (!apexHostname.includes(".")) return undefined;
      url.hostname = apexHostname;
      return url.origin;
    }

    url.hostname = `www.${hostname}`;
    return url.origin;
  } catch {
    return undefined;
  }
}

function getForwardedRequestOrigin(request: NextRequest) {
  const host = firstForwardedValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host")?.trim();
  if (!host || !isSafeHost(host)) return undefined;

  const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(":", "");
  if (protocol !== "http" && protocol !== "https") return undefined;

  return `${protocol}://${host}`;
}

function firstForwardedValue(value: string | null) {
  const first = value?.split(",", 1)[0]?.trim();
  return first || undefined;
}

function isSafeHost(value: string) {
  if (value.length > 253) return false;
  return /^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|localhost)(?::\d{1,5})?$/i.test(value);
}

function normalizeOrigin(value: string | null) {
  if (!value || value === "null") return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function toHttpsOrigin(hostname?: string) {
  if (!hostname) return undefined;
  return hostname.startsWith("http://") || hostname.startsWith("https://")
    ? hostname
    : `https://${hostname}`;
}
