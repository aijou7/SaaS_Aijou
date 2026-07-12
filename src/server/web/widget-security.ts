import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ttlCache } from "@/lib/ttl-cache";

const widgetTokenVersion = 1;
export const widgetSessionTtlMs = 24 * 60 * 60 * 1000;

type WidgetTokenPayload = {
  v: number;
  businessId: string;
  userId: string;
  origin: string;
  visitorId: string;
  iat: number;
  exp: number;
};

export async function resolveWidgetBusiness(originValue: string, workspaceKey?: string) {
  const origin = normalizeWebOrigin(originValue);

  if (!origin) {
    return null;
  }

  const cacheKey = `widget-business:${workspaceKey || "legacy"}:${origin}`;
  return ttlCache(cacheKey, 30_000, async () => {
    if (workspaceKey) {
      const business = await prisma.business.findUnique({
        where: { widgetKey: workspaceKey },
        select: {
          id: true,
          userId: true,
          businessName: true,
          websiteUrl: true,
          widgetKey: true,
          agentSettings: {
            select: { agentName: true, openingMessage: true, isActive: true },
          },
        },
      });

      return business && isOriginAllowedForWebsite(origin, business.websiteUrl)
        ? { ...business, origin }
        : null;
    }

    // Backward-compatible path for the existing Aijou portfolio widget. New
    // installations receive and should send the workspace key shown in Integrations.
    const candidates = await prisma.business.findMany({
      where: {
        OR: [
          { websiteUrl: { equals: origin, mode: "insensitive" } },
          { websiteUrl: { equals: `${origin}/`, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        userId: true,
        businessName: true,
        websiteUrl: true,
        widgetKey: true,
        agentSettings: {
          select: { agentName: true, openingMessage: true, isActive: true },
        },
      },
      take: 3,
    });
    const allowed = candidates.filter((candidate) =>
      isOriginAllowedForWebsite(origin, candidate.websiteUrl),
    );

    // A legacy origin without a workspace key is only safe when it resolves to
    // exactly one tenant. Ambiguous origins must fail closed.
    return allowed.length === 1 ? { ...allowed[0], origin } : null;
  });
}

export function createWidgetSessionToken(params: {
  businessId: string;
  userId: string;
  origin: string;
}) {
  const now = Date.now();
  const payload: WidgetTokenPayload = {
    v: widgetTokenVersion,
    businessId: params.businessId,
    userId: params.userId,
    origin: params.origin,
    visitorId: randomBytes(18).toString("base64url"),
    iat: now,
    exp: now + widgetSessionTtlMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${sign(encoded)}`,
    payload,
  };
}

export function verifyWidgetSessionToken(token: string, requestOrigin: string) {
  const [encoded, signature] = token.split(".");

  if (!encoded || !signature || encoded.length > 2048 || signature.length > 128) {
    return null;
  }

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<WidgetTokenPayload>;
    const origin = normalizeWebOrigin(requestOrigin);

    if (
      payload.v !== widgetTokenVersion ||
      typeof payload.businessId !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.visitorId !== "string" ||
      typeof payload.origin !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number" ||
      !origin ||
      payload.origin !== origin ||
      payload.exp <= Date.now() ||
      payload.iat > Date.now() + 60_000 ||
      payload.exp - payload.iat > widgetSessionTtlMs + 60_000
    ) {
      return null;
    }

    return payload as WidgetTokenPayload;
  } catch {
    return null;
  }
}

export function normalizeWebOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      return null;
    }

    if (url.username || url.password) {
      return null;
    }

    return url.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function getWorkspaceKey(
  headers: Headers,
  searchParams: URLSearchParams,
  bodyKey?: unknown,
) {
  const value =
    headers.get("x-aijou-workspace") ||
    searchParams.get("workspaceKey") ||
    (typeof bodyKey === "string" ? bodyKey : "");
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 160 ? trimmed : undefined;
}

function isOriginAllowedForWebsite(origin: string, websiteUrl: string | null) {
  const configuredOrigin = normalizeWebOrigin(websiteUrl);
  return configuredOrigin === origin;
}

function sign(value: string) {
  return createHmac("sha256", getWidgetSecret()).update(value).digest("base64url");
}

function getWidgetSecret() {
  const secret = process.env.WIDGET_SIGNING_SECRET || process.env.AUTH_SECRET;

  if (secret && (process.env.NODE_ENV !== "production" || secret.length >= 32)) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-widget-signing-secret-change-me";
  }

  throw new Error("WIDGET_SIGNING_SECRET or a strong AUTH_SECRET is required.");
}
