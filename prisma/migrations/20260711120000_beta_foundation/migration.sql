BEGIN;

-- Fail before changing the schema if existing data cannot satisfy the new
-- one-workspace-per-user invariant.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "businesses"
    GROUP BY "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Beta foundation migration blocked: duplicate businesses.userId values exist.',
      HINT = 'Merge or reassign duplicate workspaces, then run prisma migrate deploy again.';
  END IF;
END
$migration$;

-- A Meta phone number ID may only be connected to one workspace.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "whatsapp_settings"
    WHERE "phoneNumberId" IS NOT NULL
    GROUP BY "phoneNumberId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Beta foundation migration blocked: duplicate whatsapp_settings.phoneNumberId values exist.',
      HINT = 'Disconnect the duplicate Meta phone number IDs, then run prisma migrate deploy again.';
  END IF;
END
$migration$;

CREATE TYPE "PaymentProvider" AS ENUM ('XENDIT', 'MANUAL');
CREATE TYPE "PaymentSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'FAILED');
CREATE TYPE "BackgroundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

ALTER TABLE "users"
ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "businesses"
ADD COLUMN "widgetKey" TEXT;

UPDATE "businesses"
SET "widgetKey" = 'wgt_' || md5(random()::text || clock_timestamp()::text || "id")
WHERE "widgetKey" IS NULL;

ALTER TABLE "businesses"
ALTER COLUMN "widgetKey" SET NOT NULL;

ALTER TABLE "whatsapp_conversations"
ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN "sessionExpiresAt" TIMESTAMP(3),
ADD COLUMN "lastCustomerMessageAt" TIMESTAMP(3),
ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- Contacts created by the website widget used a web-* (and, in older builds,
-- web:*) synthetic phone number before the channel column existed.
UPDATE "whatsapp_conversations" AS conversation
SET "channel" = 'WEB_CHAT'
FROM "contacts" AS contact
WHERE conversation."contactId" = contact."id"
  AND (
    LOWER(contact."phoneNumber") LIKE 'web-%'
    OR LOWER(contact."phoneNumber") LIKE 'web:%'
  );

UPDATE "whatsapp_conversations" AS c
SET "lastCustomerMessageAt" = latest."createdAt"
FROM (
  SELECT "conversationId", MAX("createdAt") AS "createdAt"
  FROM "whatsapp_messages"
  WHERE "senderType" = 'CUSTOMER'
  GROUP BY "conversationId"
) AS latest
WHERE c."id" = latest."conversationId";

ALTER TABLE "whatsapp_messages"
ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'STORED',
ADD COLUMN "deliveryError" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3);

ALTER TABLE "proposal_drafts"
ADD COLUMN "proposalNumber" TEXT,
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "usage_logs"
ADD COLUMN "requestId" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "inputTokens" INTEGER,
ADD COLUMN "outputTokens" INTEGER,
ADD COLUMN "latencyMs" INTEGER,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCESS',
ADD COLUMN "errorCode" TEXT;

CREATE TABLE "payment_settings" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'XENDIT',
  "secretKey" TEXT,
  "webhookToken" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "testMode" BOOLEAN NOT NULL DEFAULT true,
  "manualInstructions" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_sessions" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL DEFAULT 'XENDIT',
  "referenceId" TEXT NOT NULL,
  "providerSessionId" TEXT,
  "paymentLinkUrl" TEXT,
  "amount" DECIMAL(14, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "status" "PaymentSessionStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "rawPayload" JSONB,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beta_invites" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT,
  "businessName" TEXT,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "usedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beta_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "background_jobs" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "dedupeKey" TEXT,
  "payload" JSONB NOT NULL,
  "status" "BackgroundJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "background_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "businesses_userId_key" ON "businesses"("userId");
CREATE UNIQUE INDEX "businesses_widgetKey_key" ON "businesses"("widgetKey");
CREATE INDEX "businesses_websiteUrl_idx" ON "businesses"("websiteUrl");
CREATE INDEX "whatsapp_conversations_businessId_status_lastMessageAt_idx" ON "whatsapp_conversations"("businessId", "status", "lastMessageAt");
CREATE INDEX "whatsapp_conversations_businessId_conversationType_lastMessageAt_idx" ON "whatsapp_conversations"("businessId", "conversationType", "lastMessageAt");
CREATE INDEX "whatsapp_conversations_businessId_channel_sessionExpiresAt_idx" ON "whatsapp_conversations"("businessId", "channel", "sessionExpiresAt");
CREATE INDEX "transactions_businessId_transactionType_status_transactionDate_idx" ON "transactions"("businessId", "transactionType", "status", "transactionDate");
CREATE INDEX "transactions_businessId_createdAt_idx" ON "transactions"("businessId", "createdAt");
CREATE INDEX "receipts_reviewStatus_createdAt_idx" ON "receipts"("reviewStatus", "createdAt");
CREATE UNIQUE INDEX "whatsapp_settings_phoneNumberId_key" ON "whatsapp_settings"("phoneNumberId");
CREATE UNIQUE INDEX "proposal_drafts_businessId_proposalNumber_key" ON "proposal_drafts"("businessId", "proposalNumber");
CREATE UNIQUE INDEX "usage_logs_requestId_key" ON "usage_logs"("requestId");
CREATE UNIQUE INDEX "payment_settings_businessId_key" ON "payment_settings"("businessId");
CREATE UNIQUE INDEX "payment_sessions_referenceId_key" ON "payment_sessions"("referenceId");
CREATE UNIQUE INDEX "payment_sessions_providerSessionId_key" ON "payment_sessions"("providerSessionId");
CREATE INDEX "payment_sessions_businessId_status_createdAt_idx" ON "payment_sessions"("businessId", "status", "createdAt");
CREATE INDEX "payment_sessions_transactionId_createdAt_idx" ON "payment_sessions"("transactionId", "createdAt");
CREATE UNIQUE INDEX "beta_invites_tokenHash_key" ON "beta_invites"("tokenHash");
CREATE INDEX "beta_invites_createdById_createdAt_idx" ON "beta_invites"("createdById", "createdAt");
CREATE INDEX "beta_invites_expiresAt_usedAt_idx" ON "beta_invites"("expiresAt", "usedAt");
CREATE UNIQUE INDEX "background_jobs_dedupeKey_key" ON "background_jobs"("dedupeKey");
CREATE INDEX "background_jobs_status_runAfter_idx" ON "background_jobs"("status", "runAfter");
CREATE INDEX "background_jobs_businessId_type_createdAt_idx" ON "background_jobs"("businessId", "type", "createdAt");

ALTER TABLE "payment_settings"
ADD CONSTRAINT "payment_settings_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_sessions"
ADD CONSTRAINT "payment_sessions_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payment_sessions"
ADD CONSTRAINT "payment_sessions_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "background_jobs"
ADD CONSTRAINT "background_jobs_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
