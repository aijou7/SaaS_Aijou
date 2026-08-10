CREATE TYPE "KnowledgeSourceType" AS ENUM ('MANUAL', 'ONBOARDING', 'WEBSITE', 'FILE', 'CONVERSATION');
CREATE TYPE "KnowledgeReviewStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

ALTER TABLE "knowledge_base"
  ADD COLUMN "sourceType" "KnowledgeSourceType" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourceName" TEXT,
  ADD COLUMN "sourceMessageId" TEXT,
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "extractedMeta" JSONB,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

UPDATE "knowledge_base"
SET "approvedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE "reviewStatus" = 'APPROVED';

CREATE INDEX "knowledge_base_businessId_isActive_reviewStatus_priority_idx"
  ON "knowledge_base"("businessId", "isActive", "reviewStatus", "priority");
CREATE INDEX "knowledge_base_businessId_sourceType_updatedAt_idx"
  ON "knowledge_base"("businessId", "sourceType", "updatedAt");
CREATE INDEX "knowledge_base_sourceMessageId_idx"
  ON "knowledge_base"("sourceMessageId");

DROP INDEX IF EXISTS "knowledge_base_businessId_isActive_idx";
