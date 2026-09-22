CREATE TYPE "BroadcastKind" AS ENUM ('MARKETING', 'CONSENT_REQUEST');

ALTER TABLE "contacts"
  ADD COLUMN "marketingConsentPendingAt" TIMESTAMP(3);

ALTER TABLE "broadcast_campaigns"
  ADD COLUMN "kind" "BroadcastKind" NOT NULL DEFAULT 'MARKETING',
  ADD COLUMN "consentMessage" TEXT;
