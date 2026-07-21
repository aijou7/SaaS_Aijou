import { NextRequest, NextResponse } from "next/server";
import { checkAbuseLimit, getClientIp } from "@/lib/abuse-guard";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import { prisma } from "@/lib/prisma";
import { readRequestBodyBuffer, RequestBodyTooLargeError } from "@/lib/request-security";
import {
  createWidgetSessionToken,
  getWorkspaceKey,
  normalizeWebOrigin,
  resolveWidgetBusiness,
} from "@/server/web/widget-security";

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const origin = normalizeWebOrigin(request.headers.get("origin"));

  if (!origin) {
    return json(request, { error: "Origin website tidak valid." }, 403);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return json(request, { error: "Content-Type tidak didukung." }, 415);
  }

  let body: { workspaceKey?: unknown } | null;
  try {
    const rawBody = await readRequestBodyBuffer(request, 8 * 1024);
    body = JSON.parse(rawBody.toString("utf8")) as { workspaceKey?: unknown };
  } catch (error) {
    return json(
      request,
      { error: error instanceof RequestBodyTooLargeError ? "Payload terlalu besar." : "Payload tidak valid." },
      error instanceof RequestBodyTooLargeError ? 413 : 400,
    );
  }
  const workspaceKey = getWorkspaceKey(request.headers, request.nextUrl.searchParams, body?.workspaceKey);
  const clientIp = getClientIp(request);
  const abuse = checkAbuseLimit(`widget-init:ip:${clientIp}`, [
    { max: 600, windowMs: 60_000 },
    { max: 10_000, windowMs: 60 * 60_000 },
  ]);

  if (!abuse.allowed) {
    return json(
      request,
      { error: "Terlalu banyak sesi baru. Coba lagi sebentar." },
      429,
      { "Retry-After": String(abuse.retryAfterSeconds) },
    );
  }

  const durableAbuse = await consumeDurableRateLimit(clientIp, [
    { scope: "widget-init:ip:1m", max: 1_000, windowMs: 60_000 },
    { scope: "widget-init:ip:1h", max: 20_000, windowMs: 60 * 60_000 },
  ]);
  if (!durableAbuse.allowed) {
    return json(request, { error: "Terlalu banyak sesi baru. Coba lagi sebentar." }, 429, {
      "Retry-After": String(durableAbuse.retryAfterSeconds),
    });
  }

  const business = await resolveWidgetBusiness(origin, workspaceKey);

  if (!business) {
    return json(request, { error: "Website belum dihubungkan ke workspace Aijou." }, 403);
  }

  // Workspace-wide capacity remains intentionally generous for legitimate
  // campaigns, while preventing a distributed botnet from bypassing the
  // per-IP guard and minting unlimited sessions for one tenant.
  const workspaceCapacity = await consumeDurableRateLimit(business.id, [
    {
      scope: "widget-init:workspace:1m",
      max: readCapacity("WIDGET_INIT_WORKSPACE_PER_MINUTE", 5_000),
      windowMs: 60_000,
    },
    {
      scope: "widget-init:workspace:1h",
      max: readCapacity("WIDGET_INIT_WORKSPACE_PER_HOUR", 100_000),
      windowMs: 60 * 60_000,
    },
  ]);
  if (!workspaceCapacity.allowed) {
    return json(request, { error: "Kapasitas widget sedang tinggi. Coba lagi sebentar." }, 429, {
      "Retry-After": String(workspaceCapacity.retryAfterSeconds),
    });
  }

  await prisma.business.updateMany({
    where: {
      id: business.id,
      OR: [
        { widgetLastSeenAt: null },
        { widgetLastSeenAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      ],
    },
    data: { widgetLastSeenAt: new Date() },
  });
  const session = createWidgetSessionToken({
    businessId: business.id,
    userId: business.userId,
    origin,
  });

  return json(request, {
    token: session.token,
    expiresAt: new Date(session.payload.exp).toISOString(),
    agent: business.agentSettings?.agentName || "Aijou AI",
    greeting:
      business.agentSettings?.openingMessage ||
      `Halo, saya ${business.agentSettings?.agentName || "Aijou"}. Ceritakan kebutuhanmu, ya.`,
    businessName: business.businessName,
    verified: true,
  });
}

function json(
  request: NextRequest,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = normalizeWebOrigin(request.headers.get("origin"));

  if (!origin) {
    return { Vary: "Origin" };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Aijou-Workspace",
    Vary: "Origin",
  };
}

function readCapacity(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 100
    ? Math.min(parsed, 10_000_000)
    : fallback;
}
