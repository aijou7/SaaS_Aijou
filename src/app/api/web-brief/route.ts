import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkAbuseLimit, generousBriefRules, getClientIp } from "@/lib/abuse-guard";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import {
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "@/lib/request-security";
import { simulateCustomerMessageForBusiness } from "@/server/conversations/conversations";
import {
  getWorkspaceKey,
  normalizeWebOrigin,
  resolveWidgetBusiness,
  verifyWidgetSessionToken,
} from "@/server/web/widget-security";

const maxBriefBodyBytes = 64 * 1024;

type BriefBody = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  company?: unknown;
  serviceInterest?: unknown;
  projectGoal?: unknown;
  location?: unknown;
  budget?: unknown;
  timeline?: unknown;
  message?: unknown;
  sessionId?: unknown;
  clientMessageId?: unknown;
  chatToken?: unknown;
  workspaceKey?: unknown;
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const origin = normalizeWebOrigin(request.headers.get("origin"));

  if (!origin) {
    return json(request, { error: "Origin website tidak diizinkan." }, 403);
  }

  const clientIp = getClientIp(request);
  const preflightLimit = checkAbuseLimit(`web-brief-pre:ip:${clientIp}`, [
    { max: 600, windowMs: 10 * 60_000 },
    { max: 4_000, windowMs: 60 * 60_000 },
  ]);
  if (!preflightLimit.allowed) {
    return json(request, { error: "Traffic brief terlalu tinggi. Coba lagi sebentar ya." }, 429, {
      "Retry-After": String(preflightLimit.retryAfterSeconds),
    });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return json(request, { error: "Content-Type tidak didukung." }, 415);
  }

  let body: BriefBody | null;
  try {
    const rawBody = await readRequestBodyBuffer(request, maxBriefBodyBytes);
    body = JSON.parse(rawBody.toString("utf8")) as BriefBody;
  } catch (error) {
    return json(
      request,
      {
        error:
          error instanceof RequestBodyTooLargeError
            ? "Payload brief terlalu besar."
            : "Payload brief tidak valid.",
      },
      error instanceof RequestBodyTooLargeError ? 413 : 400,
    );
  }
  const name = clean(body?.name, 80);
  const phone = clean(body?.phone, 40);
  const email = clean(body?.email, 120);
  const company = clean(body?.company, 120);
  const serviceInterest = clean(body?.serviceInterest, 140);
  const projectGoal = clean(body?.projectGoal, 1200);
  const location = clean(body?.location, 140);
  const budget = clean(body?.budget, 120);
  const timeline = clean(body?.timeline, 120);
  const message = clean(body?.message, 1200);
  const sessionId = clean(body?.sessionId, 160);
  const clientMessageId = clean(body?.clientMessageId, 160);
  const chatToken =
    clean(body?.chatToken, 4096) ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";

  if (!projectGoal && !message && !serviceInterest) {
    return json(request, { error: "Brief minimal perlu kebutuhan project atau service interest." }, 400);
  }

  const tokenPayload = chatToken ? verifyWidgetSessionToken(chatToken, origin) : null;
  const business = tokenPayload
    ? { id: tokenPayload.businessId, userId: tokenPayload.userId }
    : await resolveWidgetBusiness(
        origin,
        getWorkspaceKey(request.headers, request.nextUrl.searchParams, body?.workspaceKey),
      );

  if (!business) {
    return json(
      request,
      { error: "Website belum dihubungkan ke workspace Aijou. Lengkapi Website / Social di Business Profile." },
      503,
    );
  }

  const visitorKey =
    tokenPayload?.visitorId ??
    getVisitorKey(origin, sessionId || clientMessageId || randomUUID());
  const ipCheck = checkAbuseLimit(`web-brief:ip:${clientIp}`, [
    { max: 300, windowMs: 10 * 60_000 },
    { max: 2_000, windowMs: 60 * 60_000 },
  ]);
  const sessionCheck = checkAbuseLimit(
    `web-brief:${business.id}:${visitorKey}`,
    generousBriefRules,
  );
  const abuseCheck = !ipCheck.allowed ? ipCheck : sessionCheck;

  if (!abuseCheck.allowed) {
    return json(
      request,
      {
        error: "Traffic brief terlalu tinggi untuk sesi ini. Coba lagi sebentar ya.",
        retryAfterSeconds: abuseCheck.retryAfterSeconds,
      },
      429,
      { "Retry-After": String(abuseCheck.retryAfterSeconds) },
    );
  }
  const [durableIp, durableSession, durableWorkspace] = await Promise.all([
    consumeDurableRateLimit(clientIp, [
      { scope: "web-brief:ip:10m", max: 300, windowMs: 10 * 60_000 },
      { scope: "web-brief:ip:1h", max: 2_000, windowMs: 60 * 60_000 },
    ]),
    consumeDurableRateLimit(`${business.id}:${visitorKey}`, [
      { scope: "web-brief:session:10m", max: 60, windowMs: 10 * 60_000 },
      { scope: "web-brief:session:1h", max: 500, windowMs: 60 * 60_000 },
    ]),
    consumeDurableRateLimit(business.id, [
      {
        scope: "web-brief:workspace:1m",
        max: readCapacity("WEB_BRIEF_WORKSPACE_PER_MINUTE", 600),
        windowMs: 60_000,
      },
      {
        scope: "web-brief:workspace:1h",
        max: readCapacity("WEB_BRIEF_WORKSPACE_PER_HOUR", 20_000),
        windowMs: 60 * 60_000,
      },
    ]),
  ]);
  const durableAbuse = [durableIp, durableSession, durableWorkspace].find(
    (result) => !result.allowed,
  );
  if (durableAbuse) {
    return json(request, { error: "Traffic brief terlalu tinggi. Coba lagi sebentar ya." }, 429, {
      "Retry-After": String(durableAbuse.retryAfterSeconds),
    });
  }
  const phoneNumber = `web-brief-${visitorKey}`;
  const synthesizedMessage = [
    "Project brief dari website Aijou:",
    name ? `Nama: ${name}` : null,
    phone ? `Phone: ${phone}` : null,
    email ? `Email: ${email}` : null,
    company ? `Company: ${company}` : null,
    serviceInterest ? `Service interest: ${serviceInterest}` : null,
    projectGoal ? `Kebutuhan: ${projectGoal}` : null,
    location ? `Lokasi: ${location}` : null,
    budget ? `Budget: ${budget}` : null,
    timeline ? `Timeline: ${timeline}` : null,
    message ? `Catatan tambahan: ${message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await simulateCustomerMessageForBusiness(business.id, {
    phoneNumber,
    displayName: name || company || "Brief website",
    message: synthesizedMessage,
    leadSource: "BRIEF",
    providerMessageId: clientMessageId
      ? `brief-${getVisitorKey(
          origin,
          `${business.id}:${visitorKey}:${clientMessageId}`,
        )}`
      : undefined,
  });

  return json(request, {
    ok: true,
    reply:
      result.aiReply ??
      "Brief sudah masuk ke workspace Aijou. Tim kami akan review dan follow up.",
    deduped: result.deduped ?? false,
  });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function json(
  request: NextRequest,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { ...corsHeaders(request), "Cache-Control": "no-store", ...extraHeaders },
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
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Aijou-Workspace",
    Vary: "Origin",
  };
}

function getVisitorKey(origin: string, sessionKey: string) {
  return createHash("sha256").update(`${origin}:${sessionKey}`).digest("hex").slice(0, 20);
}

function readCapacity(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 100
    ? Math.min(parsed, 10_000_000)
    : fallback;
}
