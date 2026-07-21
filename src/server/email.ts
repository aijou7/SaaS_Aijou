import { createHash } from "node:crypto";

type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

export type EmailDeliveryResult = {
  configured: boolean;
  sent: boolean;
  providerId: string | null;
  error: string | null;
};

export function isTransactionalEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendTransactionalEmail(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { configured: false, sent: false, providerId: null, error: "email_not_configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": normalizeIdempotencyKey(message.idempotencyKey),
        "User-Agent": "Aijou-AI/1.0",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: { message?: string } }
      | null;
    if (!response.ok) {
      return {
        configured: true,
        sent: false,
        providerId: null,
        error: (body?.message || body?.error?.message || `email_http_${response.status}`).slice(0, 300),
      };
    }
    return { configured: true, sent: true, providerId: body?.id ?? null, error: null };
  } catch (error) {
    return {
      configured: true,
      sent: false,
      providerId: null,
      error: (error instanceof Error ? error.message : "email_delivery_failed").slice(0, 300),
    };
  }
}

export function getPublicAppUrl() {
  const fallback = process.env.NODE_ENV === "production"
    ? "https://saa-s-aijou.vercel.app"
    : "http://localhost:3000";
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || fallback;
  try {
    return new URL(configured).origin;
  } catch {
    return fallback;
  }
}

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeIdempotencyKey(value: string) {
  const clean = value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 180);
  return clean || createHash("sha256").update(value).digest("hex");
}

