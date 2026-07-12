BEGIN;

CREATE TABLE "signup_rate_limits" (
  "keyHash" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "signup_rate_limits_pkey" PRIMARY KEY ("keyHash")
);

CREATE INDEX "signup_rate_limits_expiresAt_idx"
ON "signup_rate_limits"("expiresAt");

COMMIT;
