import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { checkAbuseLimit, generousBriefRules, getClientIp } from "@/lib/abuse-guard";
import { prisma } from "@/lib/prisma";
import { ttlCache } from "@/lib/ttl-cache";
import { simulateCustomerMessage } from "@/server/conversations/conversations";

const allowedOrigins = new Set([
  "https://aksaldev.my.id",
  "https://www.aksaldev.my.id",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

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
};

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || !allowedOrigins.has(origin)) {
    return json(request, { error: "Origin website tidak diizinkan." }, 403);
  }

  const body = (await request.json().catch(() => null)) as BriefBody | null;
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

  if (!projectGoal && !message && !serviceInterest) {
    return json(request, { error: "Brief minimal perlu kebutuhan project atau service interest." }, 400);
  }

  const business = await getWebsiteBusiness(origin);

  if (!business) {
    return json(
      request,
      { error: "Website belum dihubungkan ke workspace Aijou. Lengkapi Website / Social di Business Profile." },
      503,
    );
  }

  const visitorKey = getVisitorKey(origin, sessionId || email || phone || name || "brief");
  const abuseKey = `web-brief:${origin}:${visitorKey}:${getClientIp(request)}`;
  const abuseCheck = checkAbuseLimit(abuseKey, generousBriefRules);

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
  const phoneNumber = phone ? `brief-${phone.replace(/[^\d+]/g, "").slice(0, 32)}` : `web-brief-${visitorKey}`;
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

  const result = await simulateCustomerMessage(business.userId, {
    phoneNumber,
    displayName: name || company || "Brief website",
    message: synthesizedMessage,
    leadSource: "BRIEF",
    providerMessageId: clientMessageId
      ? `brief-${getVisitorKey(origin, `${sessionId}:${clientMessageId}`)}`
      : undefined,
  });

  return json(request, {
    ok: true,
    conversationId: result.conversationId,
    reply:
      result.aiReply ??
      "Brief sudah masuk ke workspace Aijou. Tim kami akan review dan follow up.",
    lead: result.leadSummary
      ? {
          status: result.leadSummary.status,
          qualificationScore: result.leadSummary.qualificationScore,
          estimateNote: result.leadSummary.estimateNote,
          nextStep: result.leadSummary.nextStep,
          estimatedValueMin: result.leadSummary.estimatedValueMin?.toString() ?? null,
          estimatedValueMax: result.leadSummary.estimatedValueMax?.toString() ?? null,
        }
      : null,
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
    headers: { ...corsHeaders(request), ...extraHeaders },
  });
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get("origin");

  if (!origin || !allowedOrigins.has(origin)) {
    return { Vary: "Origin" };
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

async function getWebsiteBusiness(origin: string) {
  const hostname = new URL(origin).hostname;
  return ttlCache(`website-business:${hostname}`, 60_000, () =>
    prisma.business.findFirst({
      where: { websiteUrl: { contains: hostname } },
      select: { id: true, userId: true },
    }),
  );
}

function getVisitorKey(origin: string, sessionKey: string) {
  return createHash("sha256").update(`${origin}:${sessionKey}`).digest("hex").slice(0, 20);
}
