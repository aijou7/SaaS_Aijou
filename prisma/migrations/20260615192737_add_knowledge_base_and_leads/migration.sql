-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'NEED_FOLLOW_UP', 'QUALIFIED', 'CLOSED', 'SPAM');

-- CreateTable
CREATE TABLE "knowledge_base" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "needSummary" TEXT NOT NULL,
    "serviceInterest" TEXT,
    "location" TEXT,
    "budget" TEXT,
    "urgency" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "ownerNotes" TEXT,
    "extractedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_base_businessId_isActive_idx" ON "knowledge_base"("businessId", "isActive");

-- CreateIndex
CREATE INDEX "leads_businessId_status_idx" ON "leads"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_businessId_conversationId_key" ON "leads"("businessId", "conversationId");

-- AddForeignKey
ALTER TABLE "knowledge_base" ADD CONSTRAINT "knowledge_base_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
