CREATE TABLE "proposal_drafts" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "clientName" TEXT,
  "projectSummary" TEXT NOT NULL,
  "scopeOfWork" TEXT[],
  "assumptions" TEXT[],
  "exclusions" TEXT[],
  "estimatedValueMin" DECIMAL(14, 2),
  "estimatedValueMax" DECIMAL(14, 2),
  "timeline" TEXT,
  "nextSteps" TEXT[],
  "disclaimer" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "generatedBy" TEXT NOT NULL DEFAULT 'AI',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "proposal_drafts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposal_drafts_businessId_status_createdAt_idx" ON "proposal_drafts"("businessId", "status", "createdAt");
CREATE INDEX "proposal_drafts_leadId_createdAt_idx" ON "proposal_drafts"("leadId", "createdAt");

ALTER TABLE "proposal_drafts"
ADD CONSTRAINT "proposal_drafts_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "proposal_drafts"
ADD CONSTRAINT "proposal_drafts_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
