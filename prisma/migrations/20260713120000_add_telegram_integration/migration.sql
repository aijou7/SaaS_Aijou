BEGIN;

CREATE TABLE "telegram_settings" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "botToken" TEXT,
  "botId" TEXT,
  "botUsername" TEXT,
  "webhookKey" TEXT,
  "webhookKeyHash" TEXT,
  "webhookSecret" TEXT,
  "webhookUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "lastConnectedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_settings_businessId_key"
ON "telegram_settings"("businessId");

CREATE UNIQUE INDEX "telegram_settings_botId_key"
ON "telegram_settings"("botId");

CREATE UNIQUE INDEX "telegram_settings_webhookKeyHash_key"
ON "telegram_settings"("webhookKeyHash");

ALTER TABLE "telegram_settings"
ADD CONSTRAINT "telegram_settings_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
