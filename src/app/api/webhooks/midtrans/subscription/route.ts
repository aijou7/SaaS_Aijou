import { NextResponse } from "next/server";
import { applyMidtransTransactionStatus } from "@/server/subscriptions/billing";
import {
  getMidtransTransactionStatus,
  isMidtransConfigured,
  verifyMidtransSignature,
} from "@/server/subscriptions/midtrans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maxBodyBytes = 32 * 1024;

export async function POST(request: Request) {
  if (!isMidtransConfigured()) {
    return NextResponse.json({ error: "Midtrans belum dikonfigurasi." }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > maxBodyBytes) {
    return NextResponse.json({ error: "Payload terlalu besar." }, { status: 413 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBodyBytes) {
    return NextResponse.json({ error: "Payload terlalu besar." }, { status: 413 });
  }

  let notification: Record<string, unknown>;
  try {
    notification = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Payload JSON tidak valid." }, { status: 400 });
  }

  if (!verifyMidtransSignature(notification)) {
    return NextResponse.json({ error: "Signature Midtrans tidak valid." }, { status: 401 });
  }
  const orderId = typeof notification.order_id === "string"
    ? notification.order_id.trim()
    : "";
  if (!/^[A-Za-z0-9_.~-]{1,50}$/.test(orderId)) {
    return NextResponse.json({ error: "Order ID tidak valid." }, { status: 400 });
  }

  try {
    // Never activate from the webhook body alone. Challenge Midtrans's status
    // API with the server key, then apply that independently verified state.
    const verifiedStatus = await getMidtransTransactionStatus(orderId);
    const result = await applyMidtransTransactionStatus(verifiedStatus);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("midtrans_subscription_webhook_failed", {
      orderId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: "Status pembayaran belum dapat diproses." },
      { status: 500 },
    );
  }
}
