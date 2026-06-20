CREATE TABLE IF NOT EXISTS "whatsapp_settings" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "phoneNumberId" TEXT,
  "accessToken" TEXT,
  "verifyToken" TEXT,
  "appSecret" TEXT,
  "webhookUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "lastConnectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_settings_businessId_key"
  ON "whatsapp_settings"("businessId");

ALTER TABLE "whatsapp_settings"
  ADD CONSTRAINT "whatsapp_settings_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
