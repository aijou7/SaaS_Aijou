import { createHash } from "node:crypto";

export type TransactionalEmail = {
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
  return getTransactionalEmailProvider() !== null;
}

export async function sendTransactionalEmail(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  const provider = getTransactionalEmailProvider();
  if (provider === "cloudflare") return sendWithCloudflare(message);
  if (provider === "resend") return sendWithResend(message);
  return { configured: false, sent: false, providerId: null, error: "email_not_configured" };
}

export function getTransactionalEmailProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): "cloudflare" | "resend" | null {
  const requested = environment.EMAIL_PROVIDER?.trim().toLowerCase();
  const from = environment.EMAIL_FROM?.trim();
  const cloudflareReady = Boolean(
    from &&
      environment.CLOUDFLARE_ACCOUNT_ID?.trim() &&
      (
        environment.CLOUDFLARE_EMAIL_API_TOKEN?.trim() ||
        environment.CLOUDFLARE_API_TOKEN?.trim()
      ),
  );
  const resendReady = Boolean(from && environment.RESEND_API_KEY?.trim());

  if (requested === "cloudflare") return cloudflareReady ? "cloudflare" : null;
  if (requested === "resend") return resendReady ? "resend" : null;
  if (cloudflareReady) return "cloudflare";
  if (resendReady) return "resend";
  return null;
}

async function sendWithCloudflare(
  message: TransactionalEmail,
): Promise<EmailDeliveryResult> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken =
    process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim() ||
    process.env.CLOUDFLARE_API_TOKEN?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!accountId || !apiToken || !from) {
    return { configured: false, sent: false, providerId: null, error: "email_not_configured" };
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/email/sending/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          "User-Agent": "Aijou-AI/1.0",
        },
        body: JSON.stringify({
          from: parseCloudflareMailbox(from),
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          headers: {
            "X-Entity-Ref-ID": normalizeIdempotencyKey(message.idempotencyKey),
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          errors?: Array<{ code?: number; message?: string }>;
          result?: {
            delivered?: string[];
            queued?: string[];
            permanent_bounces?: string[];
          } | null;
        }
      | null;
    const accepted = [
      ...(body?.result?.delivered ?? []),
      ...(body?.result?.queued ?? []),
    ].some((recipient) => recipient.toLowerCase() === message.to.toLowerCase());
    const bounced = (body?.result?.permanent_bounces ?? [])
      .some((recipient) => recipient.toLowerCase() === message.to.toLowerCase());

    if (!response.ok || !body?.success || !accepted || bounced) {
      const providerError = body?.errors
        ?.map((item) => `${item.code ?? "unknown"}:${item.message ?? "unknown"}`)
        .join(", ");
      return {
        configured: true,
        sent: false,
        providerId: null,
        error: (providerError || `cloudflare_email_http_${response.status}`).slice(0, 300),
      };
    }

    return {
      configured: true,
      sent: true,
      providerId: `cloudflare-${createHash("sha256")
        .update(message.idempotencyKey)
        .digest("hex")
        .slice(0, 24)}`,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      sent: false,
      providerId: null,
      error: (error instanceof Error ? error.message : "cloudflare_email_failed").slice(0, 300),
    };
  }
}

async function sendWithResend(
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

function parseCloudflareMailbox(value: string) {
  const named = value.match(/^\s*([^<>]+?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (!named) return value.trim();
  return { name: named[1].trim(), address: named[2].trim() };
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
