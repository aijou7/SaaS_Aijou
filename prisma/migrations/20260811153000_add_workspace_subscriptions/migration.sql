-- SaaS subscriptions are intentionally separate from customer-facing payment
-- sessions. Existing workspaces receive a non-expiring BETA entitlement so the
-- migration cannot interrupt live chat or team access.

CREATE TYPE "SubscriptionPlan" AS ENUM ('BETA', 'STARTER', 'GROWTH', 'BUSINESS');
CREATE TYPE "SubscriptionBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "WorkspaceSubscriptionStatus" AS ENUM ('PENDING_ACTIVATION', 'TRIALING', 'PENDING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "SubscriptionPaymentProvider" AS ENUM ('MIDTRANS');
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'SETTLED', 'FAILED', 'EXPIRED', 'CANCELED', 'REFUNDED', 'CHARGEBACK');

CREATE TABLE "workspace_subscriptions" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "plan" "SubscriptionPlan" NOT NULL DEFAULT 'BETA',
  "billingCycle" "SubscriptionBillingCycle" NOT NULL DEFAULT 'MONTHLY',
  "status" "WorkspaceSubscriptionStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
  "trialStartsAt" TIMESTAMP(3),
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStartsAt" TIMESTAMP(3),
  "currentPeriodEndsAt" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "canceledAt" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_payments" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "provider" "SubscriptionPaymentProvider" NOT NULL DEFAULT 'MIDTRANS',
  "orderId" TEXT NOT NULL,
  "providerTransactionId" TEXT,
  "plan" "SubscriptionPlan" NOT NULL,
  "billingCycle" "SubscriptionBillingCycle" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
  "snapToken" TEXT,
  "redirectUrl" TEXT,
  "paymentType" TEXT,
  "providerStatus" TEXT,
  "fraudStatus" TEXT,
  "expiresAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_subscriptions_businessId_key" ON "workspace_subscriptions"("businessId");
CREATE INDEX "workspace_subscriptions_status_trialEndsAt_idx" ON "workspace_subscriptions"("status", "trialEndsAt");
CREATE INDEX "workspace_subscriptions_status_currentPeriodEndsAt_idx" ON "workspace_subscriptions"("status", "currentPeriodEndsAt");
CREATE UNIQUE INDEX "subscription_payments_orderId_key" ON "subscription_payments"("orderId");
CREATE UNIQUE INDEX "subscription_payments_providerTransactionId_key" ON "subscription_payments"("providerTransactionId");
CREATE INDEX "subscription_payments_businessId_status_createdAt_idx" ON "subscription_payments"("businessId", "status", "createdAt");
CREATE INDEX "subscription_payments_subscriptionId_status_createdAt_idx" ON "subscription_payments"("subscriptionId", "status", "createdAt");

ALTER TABLE "workspace_subscriptions"
  ADD CONSTRAINT "workspace_subscriptions_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_payments"
  ADD CONSTRAINT "subscription_payments_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "workspace_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "workspace_subscriptions"
  ("id", "businessId", "plan", "billingCycle", "status", "activatedAt", "createdAt", "updatedAt")
SELECT
  'legacy-' || md5("id"), "id", 'BETA', 'MONTHLY', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "businesses"
ON CONFLICT ("businessId") DO NOTHING;
