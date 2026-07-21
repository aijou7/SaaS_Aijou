import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { MessageType, SenderType } from "@/generated/prisma-beta/client";
import { checkAbuseLimit, generousChatRules, getClientIp } from "@/lib/abuse-guard";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import { prisma } from "@/lib/prisma";
import {
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "@/lib/request-security";
import { simulateCustomerMessageForBusiness } from "@/server/conversations/conversations";
import { activationTypes, recordActivationEvent } from "@/server/activation";
import {
  getWorkspaceKey,
  normalizeWebOrigin,
  resolveWidgetBusiness,
  verifyWidgetSessionToken,
  widgetSessionTtlMs,
} from "@/server/web/widget-security";
import {
  isExactWebChatReply,
  webChatProviderMessageId,
} from "@/server/web/chat-correlation";

const maxChatBodyBytes = 32 * 1024;

type ChatBody = {
  message?: unknown;
  visitorName?: unknown;
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
  if (!origin) return json(request, { error: "Origin website tidak valid." }, 403);

  const clientIp = getClientIp(request);
  const preflightLimit = checkAbuseLimit(`web-chat-pre:ip:${clientIp}`, [
    { max: 6_000, windowMs: 60_000 },
    { max: 100_000, windowMs: 60 * 60_000 },
  ]);
  if (!preflightLimit.allowed) {
    return json(request, { error: "Traffic chat terlalu tinggi. Coba lagi sebentar ya." }, 429, {
      "Retry-After": String(preflightLimit.retryAfterSeconds),
    });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return json(request, { error: "Content-Type tidak didukung." }, 415);
  }

  let body: ChatBody | null;
  try {
    const rawBody = await readRequestBodyBuffer(request, maxChatBodyBytes);
    body = JSON.parse(rawBody.toString("utf8")) as ChatBody;
  } catch (error) {
    return json(
      request,
      {
        error:
          error instanceof RequestBodyTooLargeError
            ? "Payload chat terlalu besar."
            : "Payload chat tidak valid.",
      },
      error instanceof RequestBodyTooLargeError ? 413 : 400,
    );
  }
  const message = clean(body?.message, 1200);
  if (!message) {
    return json(request, { error: "Pesan wajib diisi dan maksimal 1200 karakter." }, 400);
  }

  const context = await resolveChatContext(request, origin, body);
  if (!context) {
    return json(request, { error: "Sesi chat tidak valid atau sudah lewat 24 jam." }, 401);
  }

  const ipCheck = checkAbuseLimit(`web-chat:ip:${clientIp}`, [
    { max: 5_000, windowMs: 60_000 },
    { max: 100_000, windowMs: 60 * 60_000 },
  ]);
  const sessionCheck = checkAbuseLimit(
    `web-chat:session:${context.businessId}:${context.visitorKey}`,
    generousChatRules,
  );
  const abuseCheck = !ipCheck.allowed ? ipCheck : sessionCheck;
  if (!abuseCheck.allowed) {
    return json(
      request,
      { error: "Traffic chat terlalu tinggi. Coba lagi sebentar ya." },
      429,
      { "Retry-After": String(abuseCheck.retryAfterSeconds) },
    );
  }

  const [durableIp, durableSession, durableWorkspace] = await Promise.all([
    consumeDurableRateLimit(clientIp, [
      { scope: "web-chat:ip:1m", max: 5_000, windowMs: 60_000 },
      { scope: "web-chat:ip:1h", max: 100_000, windowMs: 60 * 60_000 },
    ]),
    consumeDurableRateLimit(`${context.businessId}:${context.visitorKey}`, [
      { scope: "web-chat:session:1m", max: 180, windowMs: 60_000 },
      { scope: "web-chat:session:1h", max: 2_000, windowMs: 60 * 60_000 },
    ]),
    consumeDurableRateLimit(context.businessId, [
      {
        scope: "web-chat:workspace:1m",
        max: readCapacity("WEB_CHAT_WORKSPACE_PER_MINUTE", 2_000),
        windowMs: 60_000,
      },
      {
        scope: "web-chat:workspace:1h",
        max: readCapacity("WEB_CHAT_WORKSPACE_PER_HOUR", 100_000),
        windowMs: 60 * 60_000,
      },
    ]),
  ]);
  const durableAbuse = [durableIp, durableSession, durableWorkspace].find(
    (result) => !result.allowed,
  );
  if (durableAbuse) {
    return json(request, { error: "Traffic chat terlalu tinggi. Coba lagi sebentar ya." }, 429, {
      "Retry-After": String(durableAbuse.retryAfterSeconds),
    });
  }

  const clientMessageId = clean(body?.clientMessageId, 160);
  const providerMessageId = clientMessageId
    ? webChatProviderMessageId(context.businessId, context.visitorKey, clientMessageId)
    : undefined;
  const result = await simulateCustomerMessageForBusiness(context.businessId, {
    phoneNumber: `web-${context.visitorKey}`,
    displayName: clean(body?.visitorName, 80) || "Pengunjung website",
    message,
    leadSource: "WEB_CHAT",
    providerMessageId,
  });

  await prisma.whatsAppConversation.updateMany({
    where: { id: result.conversationId, businessId: context.businessId },
    data: {
      channel: "WEB_CHAT",
      sessionExpiresAt: context.expiresAt,
      lastCustomerMessageAt: new Date(),
    },
  });
  after(async () => {
    try {
      await recordActivationEvent(context.businessId, activationTypes.firstChannel, {
        channel: "WEB_CHAT",
        origin,
      });
    } catch {
      console.error("web_chat_activation_event_failed", { businessId: context.businessId });
    }
  });

  return json(request, {
    reply:
      result.aiReply ??
      (result.processing
        ? null
        : "Pesanmu sudah diterima. Tim Aijou akan melanjutkan secepatnya."),
    replyId: result.aiMessageId,
    processing: result.processing,
    handoff: result.status === "HUMAN_NEEDED",
    deduped: result.deduped ?? false,
  });
}

export async function GET(request: NextRequest) {
  const origin = normalizeWebOrigin(request.headers.get("origin"));
  if (!origin) return json(request, { error: "Origin website tidak valid." }, 403);

  const clientIp = getClientIp(request);
  const preflightLimit = checkAbuseLimit(`web-chat-poll-pre:ip:${clientIp}`, [
    { max: 6_000, windowMs: 60_000 },
    { max: 100_000, windowMs: 60 * 60_000 },
  ]);
  if (!preflightLimit.allowed) {
    return json(request, { error: "Polling terlalu cepat." }, 429, {
      "Retry-After": String(preflightLimit.retryAfterSeconds),
    });
  }

  const context = await resolveChatContext(request, origin);
  if (!context) {
    return json(request, { error: "Sesi chat tidak valid atau sudah lewat 24 jam." }, 401);
  }

  const pollCheck = checkAbuseLimit(
    `web-chat-poll:${context.businessId}:${context.visitorKey}:${clientIp}`,
    [
      { max: 600, windowMs: 60_000 },
      { max: 10_000, windowMs: 60 * 60_000 },
    ],
  );
  if (!pollCheck.allowed) {
    return json(request, { error: "Polling terlalu cepat." }, 429, {
      "Retry-After": String(pollCheck.retryAfterSeconds),
    });
  }

  const since = clampSince(request.nextUrl.searchParams.get("since"));
  const includeHistory = request.nextUrl.searchParams.get("history") === "1";
  const pendingClientMessageId = clean(
    request.nextUrl.searchParams.get("pendingClientMessageId"),
    160,
  );
  const pendingProviderMessageId = pendingClientMessageId
    ? webChatProviderMessageId(
        context.businessId,
        context.visitorKey,
        pendingClientMessageId,
      )
    : null;
  const conversation = await prisma.whatsAppConversation.findFirst({
    where: {
      businessId: context.businessId,
      channel: "WEB_CHAT",
      contact: { phoneNumber: `web-${context.visitorKey}` },
    },
    select: {
      status: true,
      messages: {
        where: includeHistory
          ? { messageType: MessageType.TEXT }
          : {
              messageType: MessageType.TEXT,
              OR: [
                {
                  senderType: SenderType.USER,
                  createdAt: { gt: since },
                },
                ...(pendingProviderMessageId
                  ? [
                      {
                        senderType: SenderType.AI,
                        rawPayload: {
                          path: ["inReplyToProviderMessageId"],
                          equals: pendingProviderMessageId,
                        },
                      },
                    ]
                  : []),
              ],
            },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          senderType: true,
          messageBody: true,
          rawPayload: true,
          createdAt: true,
        },
      },
    },
  });
  const chronological = [...(conversation?.messages ?? [])].reverse();
  const isPendingReply = (item: (typeof chronological)[number]) =>
    isExactWebChatReply(
      item.senderType,
      item.rawPayload,
      pendingProviderMessageId,
    );

  return json(request, {
    handoff: conversation?.status === "HUMAN_NEEDED",
    messages: chronological
      .filter(
        (item) =>
          (item.senderType === SenderType.USER && item.createdAt > since) ||
          isPendingReply(item),
      )
      .map((item) => ({
        id: item.id,
        text: item.messageBody ?? "",
        createdAt: item.createdAt.toISOString(),
      })),
    history: includeHistory
      ? chronological.map((item) => ({
          id: item.id,
          role:
            item.senderType === SenderType.CUSTOMER
              ? "visitor"
              : item.senderType === SenderType.SYSTEM
                ? "system"
                : "agent",
          text: item.messageBody ?? "",
          createdAt: item.createdAt.toISOString(),
        }))
      : [],
    pendingResolved: chronological.some(isPendingReply),
    expiresAt: context.expiresAt.toISOString(),
  });
}

async function resolveChatContext(
  request: NextRequest,
  origin: string,
  body?: ChatBody | null,
) {
  const chatToken =
    clean(body?.chatToken, 4096) ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    "";
  const payload = chatToken ? verifyWidgetSessionToken(chatToken, origin) : null;
  if (payload) {
    return {
      businessId: payload.businessId,
      userId: payload.userId,
      visitorKey: payload.visitorId,
      expiresAt: new Date(payload.exp),
    };
  }

  // Compatibility for the portfolio widget that predates signed sessions.
  const sessionId =
    clean(body?.sessionId, 160) || request.nextUrl.searchParams.get("sessionId")?.trim() || "";
  if (!sessionId) return null;

  const business = await resolveWidgetBusiness(
    origin,
    getWorkspaceKey(request.headers, request.nextUrl.searchParams, body?.workspaceKey),
  );
  if (!business) return null;

  const bucket = Math.floor(Date.now() / widgetSessionTtlMs);
  return {
    businessId: business.id,
    userId: business.userId,
    visitorKey: hash(`${origin}:${sessionId}:${bucket}`),
    expiresAt: new Date((bucket + 1) * widgetSessionTtlMs),
  };
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function clampSince(value: string | null) {
  const minimum = Date.now() - widgetSessionTtlMs;
  const parsed = value ? new Date(value).getTime() : Date.now() - 60_000;
  const timestamp = Number.isFinite(parsed)
    ? Math.min(Date.now(), Math.max(minimum, parsed))
    : minimum;
  return new Date(timestamp);
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
  return origin
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Aijou-Workspace",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
}

function readCapacity(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed >= 100
    ? Math.min(parsed, 10_000_000)
    : fallback;
}
