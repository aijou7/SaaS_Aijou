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
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return false;
  }

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
    process.env.NEXT_PUBLIC_APP_URL,
    toHttpsOrigin(process.env.VERCEL_URL),
    toHttpsOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  ];

  for (const candidate of candidates) {
    const origin = normalizeOrigin(candidate ?? null);
    if (origin) origins.add(origin);
  }

  return origins;
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
