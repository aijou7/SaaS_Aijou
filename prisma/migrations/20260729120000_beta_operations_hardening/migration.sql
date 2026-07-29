CREATE TABLE "workspace_notifications" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3),
  "emailError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workspace_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_notifications_dedupeKey_key"
  ON "workspace_notifications"("dedupeKey");
CREATE INDEX "workspace_notifications_userId_readAt_createdAt_idx"
  ON "workspace_notifications"("userId", "readAt", "createdAt");
CREATE INDEX "workspace_notifications_businessId_type_createdAt_idx"
  ON "workspace_notifications"("businessId", "type", "createdAt");

ALTER TABLE "workspace_notifications"
  ADD CONSTRAINT "workspace_notifications_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_notifications"
  ADD CONSTRAINT "workspace_notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Correct only the untouched legacy seed values. Custom production profiles
-- are deliberately left alone.
UPDATE "businesses"
SET
  "serviceArea" = 'Lombok, Nusa Tenggara Barat, dan remote support',
  "address" = CASE
    WHEN "address" = 'Jakarta area' THEN 'Lombok, Nusa Tenggara Barat'
    ELSE "address"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "serviceArea" = 'Jakarta, Depok, Tangerang, dan remote support';

UPDATE "businesses"
SET
  "address" = 'Lombok, Nusa Tenggara Barat',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "address" = 'Jakarta area';
