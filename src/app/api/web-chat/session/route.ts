import { NextRequest, NextResponse } from "next/server";
import { checkAbuseLimit, getClientIp } from "@/lib/abuse-guard";
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

  const body = (await request.json().catch(() => null)) as { workspaceKey?: unknown } | null;
  const workspaceKey = getWorkspaceKey(request.headers, request.nextUrl.searchParams, body?.workspaceKey);
  const abuse = checkAbuseLimit(`widget-init:ip:${getClientIp(request)}`, [
    { max: 120, windowMs: 60_000 },
    { max: 2_000, windowMs: 60 * 60_000 },
  ]);

  if (!abuse.allowed) {
    return json(
      request,
      { error: "Terlalu banyak sesi baru. Coba lagi sebentar." },
      429,
      { "Retry-After": String(abuse.retryAfterSeconds) },
    );
  }

  const business = await resolveWidgetBusiness(origin, workspaceKey);

  if (!business) {
    return json(request, { error: "Website belum dihubungkan ke workspace Aijou." }, 403);
  }

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
