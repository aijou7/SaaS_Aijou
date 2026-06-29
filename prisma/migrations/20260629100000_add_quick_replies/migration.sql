CREATE TABLE "quick_replies" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "shortcut" TEXT,
  "category" TEXT,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quick_replies_businessId_name_key" ON "quick_replies"("businessId", "name");
CREATE INDEX "quick_replies_businessId_isActive_sortOrder_idx" ON "quick_replies"("businessId", "isActive", "sortOrder");

ALTER TABLE "quick_replies"
ADD CONSTRAINT "quick_replies_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
