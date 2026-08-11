ALTER TABLE "workspace_subscriptions"
  ADD COLUMN "trialClaimNumber" INTEGER,
  ADD COLUMN "trialClaimedAt" TIMESTAMP(3),
  ADD COLUMN "trialReminder7SentAt" TIMESTAMP(3),
  ADD COLUMN "trialReminder3SentAt" TIMESTAMP(3),
  ADD COLUMN "trialReminder1SentAt" TIMESTAMP(3),
  ADD COLUMN "trialExpiredNotifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "workspace_subscriptions_trialClaimNumber_key"
  ON "workspace_subscriptions"("trialClaimNumber");

CREATE TABLE "platform_counters" (
  "key" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_counters_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "platform_audit_logs" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "businessId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "beforeJson" JSONB,
  "afterJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "platform_audit_logs_actorId_createdAt_idx"
  ON "platform_audit_logs"("actorId", "createdAt");
CREATE INDEX "platform_audit_logs_targetType_targetId_createdAt_idx"
  ON "platform_audit_logs"("targetType", "targetId", "createdAt");
CREATE INDEX "platform_audit_logs_businessId_createdAt_idx"
  ON "platform_audit_logs"("businessId", "createdAt");

ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve trials that may have started between the subscription release and
-- this migration. Oldest verified trials receive the first claim numbers.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      ORDER BY COALESCE("trialStartsAt", "createdAt"), "createdAt", "id"
    )::INTEGER AS claim_number
  FROM "workspace_subscriptions"
  WHERE "status" = 'TRIALING'
)
UPDATE "workspace_subscriptions" AS subscription
SET
  "trialClaimNumber" = ranked.claim_number,
  "trialClaimedAt" = COALESCE(subscription."trialStartsAt", subscription."createdAt")
FROM ranked
WHERE subscription."id" = ranked."id" AND ranked.claim_number <= 100;

INSERT INTO "platform_counters" ("key", "value", "updatedAt")
SELECT
  'public_trial_claims',
  LEAST(100, COUNT(*))::INTEGER,
  CURRENT_TIMESTAMP
FROM "workspace_subscriptions"
WHERE "trialClaimNumber" IS NOT NULL
ON CONFLICT ("key") DO UPDATE SET
  "value" = GREATEST("platform_counters"."value", EXCLUDED."value"),
  "updatedAt" = CURRENT_TIMESTAMP;
