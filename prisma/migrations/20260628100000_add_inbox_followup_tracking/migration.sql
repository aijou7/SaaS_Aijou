ALTER TABLE "whatsapp_conversations"
ADD COLUMN "ownerLastReadAt" TIMESTAMP(3);

ALTER TABLE "leads"
ADD COLUMN "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN "followUpReason" TEXT;

CREATE INDEX "whatsapp_conversations_businessId_ownerLastReadAt_idx" ON "whatsapp_conversations"("businessId", "ownerLastReadAt");
CREATE INDEX "leads_businessId_nextFollowUpAt_idx" ON "leads"("businessId", "nextFollowUpAt");
