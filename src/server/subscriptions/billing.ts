import { randomBytes } from "node:crypto";
import {
  Prisma,
  SubscriptionBillingCycle,
  SubscriptionPaymentStatus,
  SubscriptionPlan,
  WorkspaceRole,
  WorkspaceSubscriptionStatus,
} from "@/generated/prisma-beta/client";
import {
  getPlanPrice,
  getSubscriptionPlan,
  type BillingCycle,
  type PublicPlanId,
} from "@/lib/subscription-plans";
import { prisma } from "@/lib/prisma";
import {
  createMidtransSnapTransaction,
  getMidtransTransactionStatus,
  isMidtransConfigured,
  type MidtransTransactionStatus,
} from "@/server/subscriptions/midtrans";
import { requireWorkspaceAccess } from "@/server/workspace-access";

const ownerRoles = [WorkspaceRole.OWNER] as const;
const managerRoles = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] as const;
const pendingReuseMs = 23 * 60 * 60_000;

export class SubscriptionBillingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SubscriptionBillingError";
  }
}

export function getSafeSubscriptionBillingError(error: unknown) {
  if (error instanceof SubscriptionBillingError) return error.message;
  return "Checkout belum berhasil dibuat. Coba lagi sebentar.";
}

export async function getSubscriptionPageData(userId: string) {
  const access = await requireWorkspaceAccess(userId, managerRoles);
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: access.businessId },
    select: {
      id: true,
      businessName: true,
      subscription: true,
      subscriptionPayments: {
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          orderId: true,
          plan: true,
          billingCycle: true,
          amount: true,
          currency: true,
          status: true,
          redirectUrl: true,
          paymentType: true,
          createdAt: true,
          settledAt: true,
        },
      },
    },
  });
  return { access, business, midtransConfigured: isMidtransConfigured() };
}

export async function createSubscriptionCheckout(
  actorUserId: string,
  input: { plan: string; billingCycle: string },
) {
  const access = await requireWorkspaceAccess(actorUserId, ownerRoles);
  const plan = parsePlan(input.plan);
  const billingCycle = parseBillingCycle(input.billingCycle);
  const definition = getSubscriptionPlan(plan);
  if (!definition) throw new SubscriptionBillingError("INVALID_PLAN", "Paket tidak valid.");
  if (!isMidtransConfigured()) {
    throw new SubscriptionBillingError(
      "NOT_CONFIGURED",
      "Pembayaran Midtrans belum diaktifkan oleh tim Aijou.",
    );
  }

  const amount = getPlanPrice(plan, billingCycle);
  const context = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: {
      id: true,
      businessName: true,
      user: { select: { name: true, email: true, phoneNumber: true } },
      subscription: { select: { id: true } },
    },
  });
  if (!context) {
    throw new SubscriptionBillingError("WORKSPACE_NOT_FOUND", "Workspace tidak ditemukan.");
  }

  const subscription = context.subscription ?? await prisma.workspaceSubscription.create({
    data: {
      businessId: context.id,
      plan: plan.toUpperCase() as SubscriptionPlan,
      billingCycle: billingCycle.toUpperCase() as SubscriptionBillingCycle,
      status: WorkspaceSubscriptionStatus.PENDING_PAYMENT,
    },
    select: { id: true },
  });

  const reusable = await prisma.subscriptionPayment.findFirst({
    where: {
      subscriptionId: subscription.id,
      plan: plan.toUpperCase() as SubscriptionPlan,
      billingCycle: billingCycle.toUpperCase() as SubscriptionBillingCycle,
      amount: new Prisma.Decimal(amount),
      status: SubscriptionPaymentStatus.PENDING,
      redirectUrl: { not: null },
      createdAt: { gt: new Date(Date.now() - pendingReuseMs) },
    },
    orderBy: { createdAt: "desc" },
    select: { orderId: true, redirectUrl: true },
  });
  if (reusable?.redirectUrl) {
    return { orderId: reusable.orderId, redirectUrl: reusable.redirectUrl };
  }

  const orderId = createSubscriptionOrderId();
  const payment = await prisma.subscriptionPayment.create({
    data: {
      businessId: context.id,
      subscriptionId: subscription.id,
      orderId,
      plan: plan.toUpperCase() as SubscriptionPlan,
      billingCycle: billingCycle.toUpperCase() as SubscriptionBillingCycle,
      amount: new Prisma.Decimal(amount),
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
    select: { id: true },
  });

  try {
    const snap = await createMidtransSnapTransaction({
      orderId,
      amount,
      itemName: "Aijou AI " + definition.name + " " + (billingCycle === "annual" ? "Tahunan" : "Bulanan"),
      customer: {
        firstName: context.user.name,
        email: context.user.email,
        phone: context.user.phoneNumber,
      },
    });
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { snapToken: snap.token, redirectUrl: snap.redirect_url },
    });
    return { orderId, redirectUrl: snap.redirect_url };
  } catch (error) {
    await prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: SubscriptionPaymentStatus.FAILED,
        failureReason: error instanceof Error ? error.message.slice(0, 500) : "Midtrans error",
      },
    });
    throw error;
  }
}

export async function syncSubscriptionPayment(actorUserId: string, orderId: string) {
  const access = await requireWorkspaceAccess(actorUserId, ownerRoles);
  const payment = await prisma.subscriptionPayment.findFirst({
    where: { businessId: access.businessId, orderId },
    select: { orderId: true },
  });
  if (!payment) {
    throw new SubscriptionBillingError("PAYMENT_NOT_FOUND", "Pembayaran tidak ditemukan.");
  }
  return applyMidtransTransactionStatus(
    await getMidtransTransactionStatus(payment.orderId),
  );
}

export async function applyMidtransTransactionStatus(status: MidtransTransactionStatus) {
  const orderId = status.order_id?.trim();
  if (!orderId) throw new SubscriptionBillingError("INVALID_STATUS", "Order ID kosong.");

  return prisma.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { orderId },
      select: {
        id: true,
        subscriptionId: true,
        plan: true,
        billingCycle: true,
        amount: true,
        currency: true,
        status: true,
        createdAt: true,
        settledAt: true,
      },
    });
    if (!payment) return { accepted: false as const, reason: "unknown_order" as const };

    const receivedAmount = Number(status.gross_amount);
    const expectedAmount = Number(payment.amount);
    if (
      !Number.isFinite(receivedAmount) ||
      Math.round(receivedAmount) !== Math.round(expectedAmount) ||
      (status.currency && status.currency.toUpperCase() !== payment.currency.toUpperCase())
    ) {
      throw new SubscriptionBillingError(
        "PAYMENT_MISMATCH",
        "Nilai pembayaran Midtrans tidak cocok dengan order.",
      );
    }

    const nextStatus = mapMidtransPaymentStatus(status);
    const now = new Date();
    const reportedSettledAt =
      parseMidtransDate(status.settlement_time) ??
      parseMidtransDate(status.transaction_time) ??
      (nextStatus === SubscriptionPaymentStatus.SETTLED ? now : null);
    const settledAt = reportedSettledAt ?? payment.settledAt;
    const updateData = {
      providerTransactionId: status.transaction_id?.slice(0, 120) || undefined,
      providerStatus: status.transaction_status?.slice(0, 80) || null,
      fraudStatus: status.fraud_status?.slice(0, 80) || null,
      paymentType: status.payment_type?.slice(0, 80) || null,
      settledAt,
      failureReason: paymentFailureReason(nextStatus, status),
      rawPayload: sanitizeMidtransStatus(status),
    };

    if (shouldPreserveTerminalPaymentStatus(payment.status, nextStatus)) {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: updateData,
      });
      return {
        accepted: true as const,
        orderId,
        paymentStatus: payment.status,
        subscriptionActivated: false,
      };
    }

    let shouldActivate = false;
    if (nextStatus === SubscriptionPaymentStatus.SETTLED) {
      const claimed = await tx.subscriptionPayment.updateMany({
        where: {
          id: payment.id,
          status: { not: SubscriptionPaymentStatus.SETTLED },
        },
        data: { ...updateData, status: nextStatus },
      });
      shouldActivate = claimed.count === 1;
      if (!shouldActivate) {
        await tx.subscriptionPayment.update({
          where: { id: payment.id },
          data: updateData,
        });
      }
    } else {
      await tx.subscriptionPayment.update({
        where: { id: payment.id },
        data: { ...updateData, status: nextStatus },
      });
    }

    if (shouldActivate) {
      const newerSettlement = await tx.subscriptionPayment.findFirst({
        where: {
          subscriptionId: payment.subscriptionId,
          status: SubscriptionPaymentStatus.SETTLED,
          createdAt: { gt: payment.createdAt },
        },
        select: { id: true },
      });
      if (newerSettlement) shouldActivate = false;
    }

    if (shouldActivate) {
      const periodStart = settledAt ?? now;
      await tx.workspaceSubscription.update({
        where: { id: payment.subscriptionId },
        data: {
          plan: payment.plan,
          billingCycle: payment.billingCycle,
          status: WorkspaceSubscriptionStatus.ACTIVE,
          currentPeriodStartsAt: periodStart,
          currentPeriodEndsAt: addBillingPeriod(
            periodStart,
            payment.billingCycle === SubscriptionBillingCycle.ANNUAL ? "annual" : "monthly",
          ),
          activatedAt: now,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          graceEndsAt: null,
        },
      });
    } else if (
      nextStatus === SubscriptionPaymentStatus.REFUNDED ||
      nextStatus === SubscriptionPaymentStatus.CHARGEBACK
    ) {
      const subscription = await tx.workspaceSubscription.findUnique({
        where: { id: payment.subscriptionId },
        select: { currentPeriodStartsAt: true },
      });
      if (
        !subscription?.currentPeriodStartsAt ||
        !payment.settledAt ||
        payment.settledAt >= subscription.currentPeriodStartsAt
      ) {
        await tx.workspaceSubscription.update({
          where: { id: payment.subscriptionId },
          data: {
            status: WorkspaceSubscriptionStatus.PAST_DUE,
            graceEndsAt: new Date(now.getTime() + 3 * 86_400_000),
          },
        });
      }
    }

    return {
      accepted: true as const,
      orderId,
      paymentStatus: nextStatus,
      subscriptionActivated: shouldActivate,
    };
  });
}

function parsePlan(value: string): PublicPlanId {
  const normalized = value.trim().toLowerCase();
  if (normalized === "starter" || normalized === "growth" || normalized === "business") {
    return normalized;
  }
  throw new SubscriptionBillingError("INVALID_PLAN", "Paket tidak valid.");
}

function parseBillingCycle(value: string): BillingCycle {
  const normalized = value.trim().toLowerCase();
  if (normalized === "monthly" || normalized === "annual") return normalized;
  throw new SubscriptionBillingError("INVALID_BILLING", "Siklus tagihan tidak valid.");
}

function createSubscriptionOrderId() {
  const stamp = Date.now().toString(36).toUpperCase();
  const nonce = randomBytes(6).toString("hex").toUpperCase();
  return "AIJOU-" + stamp + "-" + nonce;
}

function mapMidtransPaymentStatus(status: MidtransTransactionStatus) {
  const transactionStatus = status.transaction_status?.toLowerCase();
  if (
    transactionStatus === "settlement" ||
    (transactionStatus === "capture" && status.fraud_status?.toLowerCase() === "accept")
  ) {
    return SubscriptionPaymentStatus.SETTLED;
  }
  if (transactionStatus === "refund" || transactionStatus === "partial_refund") {
    return SubscriptionPaymentStatus.REFUNDED;
  }
  if (transactionStatus === "chargeback" || transactionStatus === "partial_chargeback") {
    return SubscriptionPaymentStatus.CHARGEBACK;
  }
  if (transactionStatus === "expire") return SubscriptionPaymentStatus.EXPIRED;
  if (transactionStatus === "cancel") return SubscriptionPaymentStatus.CANCELED;
  if (transactionStatus === "deny" || transactionStatus === "failure") {
    return SubscriptionPaymentStatus.FAILED;
  }
  return SubscriptionPaymentStatus.PENDING;
}

function shouldPreserveTerminalPaymentStatus(
  current: SubscriptionPaymentStatus,
  next: SubscriptionPaymentStatus,
) {
  if (
    current === SubscriptionPaymentStatus.REFUNDED ||
    current === SubscriptionPaymentStatus.CHARGEBACK
  ) {
    return next !== SubscriptionPaymentStatus.REFUNDED &&
      next !== SubscriptionPaymentStatus.CHARGEBACK;
  }
  return current === SubscriptionPaymentStatus.SETTLED &&
    next !== SubscriptionPaymentStatus.SETTLED &&
    next !== SubscriptionPaymentStatus.REFUNDED &&
    next !== SubscriptionPaymentStatus.CHARGEBACK;
}

function addBillingPeriod(start: Date, billingCycle: BillingCycle) {
  const result = new Date(start);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  if (billingCycle === "annual") {
    result.setUTCFullYear(result.getUTCFullYear() + 1);
  } else {
    result.setUTCMonth(result.getUTCMonth() + 1);
  }
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

function parseMidtransDate(value: string | undefined) {
  if (!value) return null;
  const normalized = value.includes("T")
    ? value
    : value.replace(" ", "T") + "+07:00";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function paymentFailureReason(
  status: SubscriptionPaymentStatus,
  payload: MidtransTransactionStatus,
) {
  if (
    status === SubscriptionPaymentStatus.SETTLED ||
    status === SubscriptionPaymentStatus.PENDING
  ) return null;
  return (payload.status_message || payload.transaction_status || "Pembayaran tidak berhasil")
    .slice(0, 500);
}

function sanitizeMidtransStatus(status: MidtransTransactionStatus): Prisma.InputJsonValue {
  return {
    orderId: status.order_id,
    statusCode: status.status_code,
    grossAmount: status.gross_amount,
    transactionStatus: status.transaction_status,
    transactionId: status.transaction_id ?? null,
    fraudStatus: status.fraud_status ?? null,
    paymentType: status.payment_type ?? null,
    currency: status.currency ?? null,
    transactionTime: status.transaction_time ?? null,
    settlementTime: status.settlement_time ?? null,
    expiryTime: status.expiry_time ?? null,
  };
}
