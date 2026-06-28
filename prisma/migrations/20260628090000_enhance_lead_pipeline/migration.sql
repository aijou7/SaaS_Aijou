ALTER TABLE "leads"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'CHAT',
ADD COLUMN "qualificationScore" INTEGER,
ADD COLUMN "estimatedValueMin" DECIMAL(14, 2),
ADD COLUMN "estimatedValueMax" DECIMAL(14, 2),
ADD COLUMN "estimateNote" TEXT,
ADD COLUMN "nextStep" TEXT,
ADD COLUMN "lastCustomerMessageAt" TIMESTAMP(3);

CREATE INDEX "leads_businessId_source_idx" ON "leads"("businessId", "source");
CREATE INDEX "leads_businessId_qualificationScore_idx" ON "leads"("businessId", "qualificationScore");
