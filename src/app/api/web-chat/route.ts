import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  if (!message || message.length > 1200) {
    return json(request, { error: "Pesan wajib diisi dan maksimal 1200 karakter." }, 400);
  }

  const hostname = new URL(origin).hostname;
  const business = await prisma.business.findFirst({
    where: { websiteUrl: { contains: hostname } },
    select: { userId: true },
  });

  if (!business) {
    return json(
      request,
      { error: "Website belum dihubungkan ke workspace Aijou. Lengkapi Website / Social di Business Profile." },
      503,
    );
  }

  const visitorKey = createHash("sha256")
    .update(`${origin}:${sessionId || visitorName || "anonymous"}`)
    .digest("hex")
    .slice(0, 20);

  const result = await simulateCustomerMessage(business.userId, {
    phoneNumber: `web-${visitorKey}`,
    displayName: visitorName.slice(0, 80) || "Pengunjung website",
    message,
  });

  return json(request, {
    reply:
      result.aiReply ??
      "Pesanmu sudah diterima. Tim Aijou akan melanjutkan percakapan ini secepatnya.",
    handoff: result.status === "HUMAN_NEEDED",
  });
}

function json(request: NextRequest, body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
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
