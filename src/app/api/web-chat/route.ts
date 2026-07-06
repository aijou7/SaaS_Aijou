import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { MessageType, SenderType } from "@/generated/prisma/client";
import { checkAbuseLimit, generousChatRules, getClientIp } from "@/lib/abuse-guard";
import { prisma } from "@/lib/prisma";
import { ttlCache } from "@/lib/ttl-cache";
import { simulateCustomerMessage } from "@/server/conversations/conversations";

const allowedOrigins = new Set([
  "https://aksaldev.my.id",
  "https://www.aksaldev.my.id",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || !allowedOrigins.has(origin)) {
    return json(request, { error: "Origin website tidak diizinkan." }, 403);
  }

  const body = await request.json().catch(() => null);
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const visitorName = typeof body?.visitorName === "string" ? body.visitorName.trim() : "";
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
  const clientMessageId = typeof body?.clientMessageId === "string" ? body.clientMessageId.trim() : "";

  if (!message || message.length > 1200) {
    return json(request, { error: "Pesan wajib diisi dan maksimal 1200 karakter." }, 400);
  }

  const business = await getWebsiteBusiness(origin);

  if (!business) {
    return json(
      request,
      { error: "Website belum dihubungkan ke workspace Aijou. Lengkapi Website / Social di Business Profile." },
      503,
    );
  }

  const visitorKey = getVisitorKey(origin, sessionId || visitorName || "anonymous");
  const abuseKey = `web-chat:${origin}:${visitorKey}:${getClientIp(request)}`;
  const abuseCheck = checkAbuseLimit(abuseKey, generousChatRules);

  if (!abuseCheck.allowed) {
    return json(
      request,
      {
        error: "Traffic chat terlalu tinggi untuk sesi ini. Coba lagi sebentar ya.",
        retryAfterSeconds: abuseCheck.retryAfterSeconds,
      },
      429,
      { "Retry-After": String(abuseCheck.retryAfterSeconds) },
    );
  }
  const providerMessageId = clientMessageId
    ? `web-${getVisitorKey(origin, `${sessionId}:${clientMessageId}`)}`
    : undefined;

  const result = await simulateCustomerMessage(business.userId, {
    phoneNumber: `web-${visitorKey}`,
    displayName: visitorName.slice(0, 80) || "Pengunjung website",
    message,
    leadSource: "WEB_CHAT",
    providerMessageId,
  });

  return json(request, {
    conversationId: result.conversationId,
    reply:
      result.aiReply ??
      "Pesanmu sudah diterima. Tim Aijou akan melanjutkan percakapan ini secepatnya.",
    handoff: result.status === "HUMAN_NEEDED",
    deduped: result.deduped ?? false,
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

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin || !allowedOrigins.has(origin)) {
    return json(request, { error: "Origin website tidak diizinkan." }, 403);
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return json(request, { error: "Sesi chat tidak ditemukan." }, 400);
  }

  const business = await getWebsiteBusiness(origin);
  if (!business) {
    return json(request, { error: "Website belum dihubungkan ke workspace Aijou." }, 503);
  }

  const sinceValue = request.nextUrl.searchParams.get("since");
  const since = sinceValue ? new Date(sinceValue) : new Date(Date.now() - 60_000);
  const createdAfter = Number.isNaN(since.getTime()) ? new Date(Date.now() - 60_000) : since;
  const phoneNumber = `web-${getVisitorKey(origin, sessionId)}`;
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: { businessId: business.id, contact: { phoneNumber } },
    select: {
      status: true,
      messages: {
        where: {
          senderType: SenderType.USER,
          messageType: MessageType.TEXT,
          createdAt: { gt: createdAfter },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, messageBody: true, createdAt: true },
      },
    },
  });

  return json(request, {
    handoff: conversation?.status === "HUMAN_NEEDED",
    messages:
      conversation?.messages.map((message) => ({
        id: message.id,
        text: message.messageBody ?? "",
        createdAt: message.createdAt.toISOString(),
      })) ?? [],
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
