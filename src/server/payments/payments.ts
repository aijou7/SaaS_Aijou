import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  PaymentProvider,
  PaymentSessionStatus,
  Prisma,
  TransactionStatus,
  TransactionType,
} from "@/generated/prisma-beta/client";
import { decryptSecret, encryptSecret } from "@/lib/secret-encryption";
import { prisma } from "@/lib/prisma";
import {
  readCredentialSnapshot,
  requireCompleteCredentialReplacement,
} from "@/server/integrations/credential-recovery";

const xenditApiBase = "https://api.xendit.co";

export type PaymentSettingsInput = {
  secretKey?: string | null;
  webhookToken?: string | null;
  isActive?: boolean;
};

export async function getPaymentReadinessForBusiness(businessId: string) {
  const stored = await prisma.paymentSettings.findUnique({
    where: { businessId },
  });
  if (!stored) return false;

  try {
    const settings = decryptPaymentSettings(stored);
    return Boolean(settings.isActive && settings.secretKey && settings.webhookToken);
  } catch {
    console.error("payment_credentials_decrypt_failed", { businessId });
    return false;
  }
}

export async function getPaymentsPage(userId: string) {
  const business = await getBusinessForUser(userId);
  if (!business) {
    return {
      business: null,
      configurationIssue: null,
      settings: null,
      ready: false,
      summary: { pending: 0, completed: 0, failed: 0 },
      recent: [],
    };
  }

  const [stored, grouped, recent] = await Promise.all([
    prisma.paymentSettings.findUnique({ where: { businessId: business.id } }),
    prisma.paymentSession.groupBy({
      by: ["status"],
      where: { businessId: business.id },
      _count: { _all: true },
    }),
    prisma.paymentSession.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        referenceId: true,
        status: true,
        amount: true,
        currency: true,
        paymentLinkUrl: true,
        createdAt: true,
        transaction: { select: { id: true, merchantName: true } },
      },
    }),
  ]);
  const rawSettings = stored ?? {
    businessId: business.id,
    secretKey: null,
    webhookToken: null,
    isActive: false,
    testMode: true,
  };
  let configurationIssue: string | null = null;
  let settings;
  try {
    settings = decryptPaymentSettings(rawSettings);
  } catch {
    configurationIssue =
      "Credential payment tidak dapat dibaca. Isi ulang Xendit secret key dan webhook verification token.";
    settings = { ...rawSettings, secretKey: null, webhookToken: null, isActive: false };
    console.error("payment_credentials_decrypt_failed", { businessId: business.id });
  }
  const count = (status: PaymentSessionStatus) =>
    grouped.find((item) => item.status === status)?._count._all ?? 0;

  return {
    business,
    configurationIssue,
    settings: {
      isActive: settings.isActive,
      testMode: settings.testMode,
      secretKeyMasked: maskSecret(settings.secretKey),
      webhookTokenMasked: maskSecret(settings.webhookToken),
      secretKeySet: Boolean(settings.secretKey),
      webhookTokenSet: Boolean(settings.webhookToken),
    },
    ready: Boolean(settings.isActive && settings.secretKey && settings.webhookToken),
    summary: {
      pending: count(PaymentSessionStatus.PENDING),
      completed: count(PaymentSessionStatus.COMPLETED),
      failed: count(PaymentSessionStatus.FAILED),
    },
    recent: recent.map((item) => ({
      ...item,
      amount: Number(item.amount),
      createdAt: item.createdAt.toISOString(),
    })),
  };
}

export async function updatePaymentSettings(userId: string, input: PaymentSettingsInput) {
  const business = await requireBusinessForUser(userId);
  const stored = await ensurePaymentSettings(business.id);
  const credentialSnapshot = readCredentialSnapshot(
    () => decryptPaymentSettings(stored),
    { ...stored, secretKey: null, webhookToken: null, isActive: false },
  );
  const existing = credentialSnapshot.value;
  const incomingSecretKey = cleanCredential(input.secretKey);
  const incomingWebhookToken = cleanCredential(input.webhookToken);

  requireCompleteCredentialReplacement(
    credentialSnapshot.recoveryRequired,
    [incomingSecretKey, incomingWebhookToken],
    "Credential payment lama tidak dapat dibaca. Isi ulang Xendit secret key dan webhook verification token.",
  );

  const secretKey = mergeSecret(existing.secretKey, incomingSecretKey);
  const webhookToken = mergeSecret(existing.webhookToken, incomingWebhookToken);
  if (secretKey && secretKey.length < 20) {
    throw new Error("Xendit secret key terlihat tidak valid.");
  }
  if (secretKey && secretKey.length > 4_096) {
    throw new Error("Xendit secret key terlalu panjang.");
  }
  if (webhookToken && webhookToken.length < 16) {
    throw new Error("Webhook verification token minimal 16 karakter.");
  }
  if (webhookToken && webhookToken.length > 4_096) {
    throw new Error("Webhook verification token terlalu panjang.");
  }

  const ready = Boolean(secretKey && webhookToken);
  return prisma.paymentSettings.update({
    where: { businessId: business.id },
    data: {
      secretKey: encryptSecret(secretKey, secretContext(business.id, "secretKey")),
      webhookToken: encryptSecret(
        webhookToken,
        secretContext(business.id, "webhookToken"),
      ),
      testMode: detectXenditTestMode(secretKey),
      isActive: Boolean(input.isActive && ready),
    },
  });
}

export async function createPaymentLinkForTransaction(
  userId: string,
  transactionId: string,
) {
  const business = await requireBusinessForUser(userId);
  const settings = decryptPaymentSettings(await ensurePaymentSettings(business.id));
  if (!settings.isActive || !settings.secretKey || !settings.webhookToken) {
    throw new Error("Aktifkan Xendit dan lengkapi credential terlebih dahulu.");
  }

  const claim = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "transactions"
      WHERE "id" = ${transactionId} AND "businessId" = ${business.id}
      FOR UPDATE
    `;
    const transaction = await tx.transaction.findFirst({
      where: {
        id: transactionId,
        businessId: business.id,
        transactionType: TransactionType.INCOME,
      },
      select: {
        id: true,
        merchantName: true,
        description: true,
        totalAmount: true,
        currency: true,
        status: true,
      },
    });
    if (!transaction) throw new Error("Order tidak ditemukan.");
    if (transaction.status === TransactionStatus.CONFIRMED) {
      throw new Error("Order ini sudah berstatus paid/confirmed.");
    }
    if (transaction.status !== TransactionStatus.PENDING_CONFIRMATION) {
      throw new Error("Order harus berstatus Pending sebelum dibuatkan payment link.");
    }

    const existing = await tx.paymentSession.findFirst({
      where: {
        transactionId: transaction.id,
        status: PaymentSessionStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing?.expiresAt && existing.expiresAt <= new Date()) {
      await tx.paymentSession.update({
        where: { id: existing.id },
        data: { status: PaymentSessionStatus.EXPIRED },
      });
    } else if (existing) {
      return { transaction, pending: existing, existing: true };
    }

    const referenceId =
      "ord_" + transaction.id.slice(0, 24) + "_" + randomUUID().slice(0, 8);
    const pending = await tx.paymentSession.create({
      data: {
        businessId: business.id,
        transactionId: transaction.id,
        referenceId,
        provider: PaymentProvider.XENDIT,
        amount: transaction.totalAmount,
        currency: transaction.currency,
        status: PaymentSessionStatus.PENDING,
      },
    });
    return { transaction, pending, existing: false };
  });

  if (claim.existing) {
    if (claim.pending.paymentLinkUrl) return claim.pending;
    throw new Error(
      "Pembuatan payment link sebelumnya belum punya hasil pasti. Cek dashboard Xendit sebelum mencoba ulang agar customer tidak menerima link ganda.",
    );
  }

  const { pending, transaction } = claim;
  const referenceId = pending.referenceId;
  const amount = Number(transaction.totalAmount);
  if (
    transaction.currency !== "IDR" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    await markPaymentFailed(pending.id, "Order harus memakai nominal IDR bulat di atas nol.");
    throw new Error("Payment link Xendit saat ini hanya mendukung nominal IDR bulat di atas nol.");
  }
  const customerName = sanitizeName(transaction.merchantName || "Customer");
  const requestBody = {
    reference_id: referenceId,
    session_type: "PAY",
    mode: "PAYMENT_LINK",
    amount,
    currency: transaction.currency,
    country: "ID",
    customer: {
      reference_id: "cust" + hashReference(referenceId),
      type: "INDIVIDUAL",
      individual_detail: { given_names: customerName },
    },
    items: [
      {
        reference_id: transaction.id,
        type: "DIGITAL_SERVICE",
        name: (transaction.description || "Aijou order").slice(0, 255),
        category: "SERVICES",
        net_unit_amount: amount,
        quantity: 1,
        currency: transaction.currency,
      },
    ],
    capture_method: "AUTOMATIC",
    locale: "id",
    description: (transaction.description || "Payment " + referenceId).slice(0, 1_000),
    ...buildReturnUrls(),
    metadata: { transaction_id: transaction.id, business_id: business.id },
  };

  let response: Response;
  try {
    response = await fetch(xenditApiBase + "/sessions", {
      method: "POST",
      headers: {
        Authorization:
          "Basic " + Buffer.from(settings.secretKey + ":").toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Xendit tidak dapat dihubungi.";
    await markPaymentUncertain(pending.id, `Status remote belum pasti: ${message}`);
    throw new Error(
      "Koneksi ke Xendit terputus sebelum hasil diterima. Cek dashboard Xendit dahulu sebelum mencoba ulang.",
    );
  }

  const responseBody = (await response.json().catch(() => ({}))) as XenditSessionResponse;
  if (!response.ok) {
    const message =
      typeof responseBody.message === "string"
        ? responseBody.message.slice(0, 500)
        : "Xendit request gagal (" + response.status + ").";
    await markPaymentFailed(pending.id, message, responseBody);
    throw new Error("Payment link gagal dibuat: " + message);
  }
  if (!responseBody.payment_session_id || !responseBody.payment_link_url) {
    await markPaymentUncertain(
      pending.id,
      "Xendit menerima request tetapi response tidak memuat session ID/link.",
      responseBody,
    );
    throw new Error("Xendit menerima request, tetapi hasilnya belum lengkap. Cek dashboard Xendit.");
  }

  const updateData = {
    providerSessionId: responseBody.payment_session_id,
    paymentLinkUrl: responseBody.payment_link_url,
    expiresAt: parseOptionalDate(responseBody.expires_at),
    rawPayload: toJson(responseBody),
    lastError: null,
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.paymentSession.update({
        where: { id: pending.id },
        data: updateData,
      });
    } catch (error) {
      if (attempt === 2) {
        await markPaymentUncertain(
          pending.id,
          `Remote session ${responseBody.payment_session_id} sudah dibuat, tetapi sinkronisasi database gagal.`,
          responseBody,
        ).catch(() => undefined);
        throw new Error(
          "Payment link sudah dibuat di Xendit, tetapi dashboard belum tersinkron. Jangan buat ulang; cek dashboard Xendit.",
          { cause: error },
        );
      }
      await delay(100 * (attempt + 1));
    }
  }

  throw new Error("Payment link belum dapat disinkronkan.");
}

export async function handleXenditWebhook(params: {
  token: string | null;
  payload: unknown;
}) {
  const parsed = parseWebhookPayload(params.payload);
  const session = await prisma.paymentSession.findUnique({
    where: { referenceId: parsed.referenceId },
    include: { business: { select: { paymentSettings: true } } },
  });
  if (!session?.business.paymentSettings) {
    return { accepted: false, status: 403 as const, reason: "invalid_token" };
  }

  const settings = decryptPaymentSettings(session.business.paymentSettings);
  if (!params.token || !settings.webhookToken || !safeEqual(params.token, settings.webhookToken)) {
    return { accepted: false, status: 403 as const, reason: "invalid_token" };
  }
  if (session.providerSessionId && parsed.providerSessionId !== session.providerSessionId) {
    return { accepted: false, status: 409 as const, reason: "session_mismatch" };
  }
  if (
    parsed.currency !== session.currency ||
    parsed.amount !== Number(session.amount)
  ) {
    return { accepted: false, status: 409 as const, reason: "payment_value_mismatch" };
  }

  const nextStatus =
    parsed.event === "payment_session.completed"
      ? PaymentSessionStatus.COMPLETED
      : PaymentSessionStatus.EXPIRED;
  if (
    session.status === PaymentSessionStatus.COMPLETED ||
    (nextStatus === PaymentSessionStatus.EXPIRED &&
      session.status !== PaymentSessionStatus.PENDING)
  ) {
    return {
      accepted: true,
      status: 200 as const,
      paymentStatus: session.status,
      idempotent: true,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.paymentSession.update({
      where: { id: session.id },
      data: {
        status: nextStatus,
        providerSessionId: session.providerSessionId ?? parsed.providerSessionId,
        completedAt:
          nextStatus === PaymentSessionStatus.COMPLETED
            ? parsed.updatedAt ?? new Date()
            : null,
        rawPayload: toJson(params.payload),
        lastError: null,
      },
    });
    if (nextStatus === PaymentSessionStatus.COMPLETED) {
      await tx.transaction.update({
        where: { id: session.transactionId },
        data: { status: TransactionStatus.CONFIRMED },
      });
    }
  });
  return { accepted: true, status: 200 as const, paymentStatus: nextStatus };
}

async function ensurePaymentSettings(businessId: string) {
  return prisma.paymentSettings.upsert({
    where: { businessId },
    update: {},
    create: {
      businessId,
      secretKey: null,
      webhookToken: null,
      isActive: false,
      testMode: true,
    },
  });
}

function decryptPaymentSettings<T extends {
  businessId: string;
  secretKey: string | null;
  webhookToken: string | null;
}>(settings: T) {
  return {
    ...settings,
    secretKey: decryptSecret(settings.secretKey, secretContext(settings.businessId, "secretKey")),
    webhookToken: decryptSecret(
      settings.webhookToken,
      secretContext(settings.businessId, "webhookToken"),
    ),
  };
}

async function getBusinessForUser(userId: string) {
  return prisma.business.findUnique({
    where: { userId },
    select: { id: true, businessName: true },
  });
}

async function requireBusinessForUser(userId: string) {
  const business = await getBusinessForUser(userId);
  if (!business) throw new Error("Workspace bisnis belum dibuat.");
  return business;
}

async function markPaymentFailed(id: string, error: string, rawPayload?: unknown) {
  await prisma.paymentSession.updateMany({
    where: { id, status: PaymentSessionStatus.PENDING },
    data: {
      status: PaymentSessionStatus.FAILED,
      lastError: error.slice(0, 1_000),
      rawPayload: rawPayload === undefined ? undefined : toJson(rawPayload),
    },
  });
}

async function markPaymentUncertain(id: string, error: string, rawPayload?: unknown) {
  await prisma.paymentSession.updateMany({
    where: { id, status: PaymentSessionStatus.PENDING },
    data: {
      lastError: error.slice(0, 1_000),
      rawPayload: rawPayload === undefined ? undefined : toJson(rawPayload),
    },
  });
}

function parseWebhookPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Webhook payload tidak valid.");
  }
  const event = "event" in payload && typeof payload.event === "string" ? payload.event : "";
  const data =
    "data" in payload && payload.data && typeof payload.data === "object"
      ? payload.data as Record<string, unknown>
      : {};
  if (event !== "payment_session.completed" && event !== "payment_session.expired") {
    throw new Error("Webhook event tidak didukung.");
  }
  const referenceId = typeof data.reference_id === "string" ? data.reference_id : "";
  if (!referenceId || referenceId.length > 64) {
    throw new Error("Reference ID tidak valid.");
  }
  const providerSessionId =
    typeof data.payment_session_id === "string" ? data.payment_session_id : "";
  const amount = typeof data.amount === "number" ? data.amount : Number.NaN;
  const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : "";
  const providerStatus = typeof data.status === "string" ? data.status.toUpperCase() : "";
  const expectedStatus =
    event === "payment_session.completed" ? "COMPLETED" : "EXPIRED";
  if (
    !providerSessionId ||
    providerSessionId.length > 64 ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    !/^[A-Z]{3}$/.test(currency) ||
    providerStatus !== expectedStatus
  ) {
    throw new Error("Data status payment session tidak valid.");
  }

  return {
    event,
    referenceId,
    providerSessionId,
    amount,
    currency,
    updatedAt: parseOptionalDate(data.updated),
  };
}

function buildReturnUrls() {
  const value = process.env.NEXT_PUBLIC_APP_URL;
  if (!value) return {};
  try {
    const base = new URL(value);
    if (base.protocol !== "https:") return {};
    return {
      success_return_url: new URL(
        "/payment-result?state=success",
        base,
      ).toString(),
      cancel_return_url: new URL(
        "/payment-result?state=cancelled",
        base,
      ).toString(),
    };
  } catch {
    return {};
  }
}

function mergeSecret(existing: string | null, incoming?: string | null) {
  return incoming ?? existing;
}

function cleanCredential(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function detectXenditTestMode(secretKey: string | null) {
  if (!secretKey) return true;
  return !secretKey.toLowerCase().includes("production");
}

function clean(value: string | null | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function maskSecret(value: string | null) {
  if (!value) return "Not set";
  if (value.length < 9) return "Set";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

function sanitizeName(value: string) {
  return value
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50) || "Customer";
}

function hashReference(value: string) {
  return Buffer.from(value)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 40);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function secretContext(businessId: string, field: string) {
  return "payment-settings:" + businessId + ":" + field;
}

function parseOptionalDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

type XenditSessionResponse = {
  payment_session_id?: string;
  payment_link_url?: string;
  expires_at?: string;
  message?: string;
  [key: string]: unknown;
};
