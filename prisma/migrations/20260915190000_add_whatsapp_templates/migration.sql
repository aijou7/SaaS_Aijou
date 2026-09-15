CREATE TYPE "WhatsAppTemplatePurpose" AS ENUM ('MARKETING', 'UTILITY', 'AUTHENTICATION');
CREATE TYPE "WhatsAppTemplateStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "whatsapp_templates" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "purpose" "WhatsAppTemplatePurpose" NOT NULL DEFAULT 'UTILITY',
  "languageCode" TEXT NOT NULL DEFAULT 'id',
  "title" TEXT,
  "body" TEXT NOT NULL,
  "headerImageUrl" TEXT,
  "headerImagePath" TEXT,
  "status" "WhatsAppTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_templates_businessId_name_key"
  ON "whatsapp_templates"("businessId", "name");
CREATE INDEX "whatsapp_templates_businessId_status_updatedAt_idx"
  ON "whatsapp_templates"("businessId", "status", "updatedAt");

ALTER TABLE "whatsapp_templates"
  ADD CONSTRAINT "whatsapp_templates_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
