import { createHash, timingSafeEqual } from "node:crypto";
import { getPublicAppUrl } from "@/server/email";

const requestTimeoutMs = 15_000;

export type MidtransTransactionStatus = {
  order_id: string;
  status_code: string;
  gross_amount: string;
  transaction_status: string;
  transaction_id?: string;
  fraud_status?: string;
  payment_type?: string;
  currency?: string;
  transaction_time?: string;
  settlement_time?: string;
  expiry_time?: string;
  signature_key?: string;
  status_message?: string;
};

type SnapResponse = {
  token: string;
  redirect_url: string;
};

export class MidtransError extends Error {
  constructor(
    message: string,
    readonly code = "MIDTRANS_ERROR",
  ) {
    super(message);
    this.name = "MidtransError";
  }
}

export function isMidtransConfigured() {
  return Boolean(process.env.MIDTRANS_SERVER_KEY?.trim());
}

export function isMidtransProduction() {
  const environment = process.env.MIDTRANS_ENVIRONMENT?.trim().toLowerCase();
  if (environment) return environment === "production";
  return ["1", "true", "yes", "on"].includes(
    process.env.MIDTRANS_IS_PRODUCTION?.trim().toLowerCase() ?? "",
  );
}

export async function createMidtransSnapTransaction(input: {
  orderId: string;
  amount: number;
  itemName: string;
  customer: { firstName: string; email: string; phone?: string | null };
}) {
  const baseUrl = isMidtransProduction()
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";
  const appUrl = getPublicAppUrl();
  const callbackUrl = `${appUrl}/subscription?payment=return&order_id=${encodeURIComponent(input.orderId)}`;
  return midtransRequest<SnapResponse>(
    `${baseUrl}/snap/v1/transactions`,
    {
      method: "POST",
      body: JSON.stringify({
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amount,
        },
        item_details: [
          {
            id: input.orderId,
            price: input.amount,
            quantity: 1,
            name: input.itemName.slice(0, 50),
          },
        ],
        customer_details: {
          first_name: input.customer.firstName.slice(0, 50),
          email: input.customer.email,
          phone: input.customer.phone || undefined,
        },
        callbacks: {
          finish: callbackUrl,
          error: callbackUrl,
          pending: callbackUrl,
        },
        expiry: { unit: "day", duration: 1 },
      }),
    },
  );
}

export async function getMidtransTransactionStatus(orderId: string) {
  if (!/^[A-Za-z0-9_.~-]{1,50}$/.test(orderId)) {
    throw new MidtransError("Order ID Midtrans tidak valid.", "INVALID_ORDER_ID");
  }
  const baseUrl = isMidtransProduction()
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";
  return midtransRequest<MidtransTransactionStatus>(
    `${baseUrl}/v2/${encodeURIComponent(orderId)}/status`,
    { method: "GET" },
  );
}

export function verifyMidtransSignature(payload: {
  order_id?: unknown;
  status_code?: unknown;
  gross_amount?: unknown;
  signature_key?: unknown;
}) {
  const orderId = typeof payload.order_id === "string" ? payload.order_id : "";
  const statusCode = typeof payload.status_code === "string" ? payload.status_code : "";
  const grossAmount = typeof payload.gross_amount === "string" ? payload.gross_amount : "";
  const signature = typeof payload.signature_key === "string" ? payload.signature_key : "";
  const serverKey = getServerKey();
  if (!orderId || !statusCode || !grossAmount || !/^[a-fA-F0-9]{128}$/.test(signature)) {
    return false;
  }
  const expected = createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest("hex");
  const receivedBuffer = Buffer.from(signature.toLowerCase(), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function midtransRequest<T>(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${getServerKey()}:`).toString("base64")}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const statusMessage =
        parsed &&
        typeof parsed === "object" &&
        "status_message" in parsed &&
        typeof parsed.status_message === "string"
          ? parsed.status_message
          : `HTTP ${response.status}`;
      throw new MidtransError(
        `Midtrans menolak permintaan: ${statusMessage.slice(0, 180)}`,
        `MIDTRANS_HTTP_${response.status}`,
      );
    }
    if (!parsed || typeof parsed !== "object") {
      throw new MidtransError("Respons Midtrans tidak valid.", "INVALID_RESPONSE");
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof MidtransError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MidtransError("Midtrans belum merespons. Coba lagi.", "TIMEOUT");
    }
    throw new MidtransError("Midtrans belum dapat dihubungi.", "NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

function getServerKey() {
  const key = process.env.MIDTRANS_SERVER_KEY?.trim();
  if (!key) {
    throw new MidtransError(
      "MIDTRANS_SERVER_KEY belum dipasang di environment aplikasi.",
      "NOT_CONFIGURED",
    );
  }
  return key;
}
