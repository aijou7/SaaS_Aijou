CREATE TABLE "owner_email_change_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "currentEmail" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "currentCodeHash" TEXT NOT NULL,
    "newCodeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_email_change_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "owner_email_change_requests_userId_consumedAt_expiresAt_idx"
ON "owner_email_change_requests"("userId", "consumedAt", "expiresAt");

CREATE INDEX "owner_email_change_requests_businessId_createdAt_idx"
ON "owner_email_change_requests"("businessId", "createdAt");

CREATE INDEX "owner_email_change_requests_newEmail_consumedAt_idx"
ON "owner_email_change_requests"("newEmail", "consumedAt");

ALTER TABLE "owner_email_change_requests"
ADD CONSTRAINT "owner_email_change_requests_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "owner_email_change_requests"
ADD CONSTRAINT "owner_email_change_requests_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
