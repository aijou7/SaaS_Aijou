-- Beta hardening: account lifecycle, durable guards, team access, feedback,
-- activation telemetry, widget verification, and operator assignment.

CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING');
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'AGENT', 'VIEWER');
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'IDEA', 'CONFUSING', 'SUPPORT', 'OTHER');
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');
CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

ALTER TABLE "users"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "signupSource" TEXT NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "signupAttribution" JSONB,
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);

-- Accounts that existed before email verification shipped remain usable.
UPDATE "users" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;

ALTER TABLE "businesses"
  ADD COLUMN "widgetAllowedOrigin" TEXT,
  ADD COLUMN "widgetLastSeenAt" TIMESTAMP(3);

UPDATE "businesses"
SET "widgetAllowedOrigin" = "websiteUrl"
WHERE "websiteUrl" IS NOT NULL AND "widgetAllowedOrigin" IS NULL;

ALTER TABLE "whatsapp_conversations" ADD COLUMN "assignedToUserId" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "sentByUserId" TEXT;
ALTER TABLE "agent_settings" ALTER COLUMN "isActive" SET DEFAULT false;

CREATE TABLE "security_rate_limits" (
  "keyHash" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("keyHash")
);

CREATE TABLE "auth_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "AuthTokenPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workspace_memberships" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'AGENT',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "team_invites" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'AGENT',
  "tokenHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "acceptedById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "feedback" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "category" "FeedbackCategory" NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "rating" INTEGER,
  "pageUrl" TEXT,
  "userAgent" TEXT,
  "adminResponse" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "activation_events" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activation_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");
CREATE INDEX "auth_tokens_userId_purpose_createdAt_idx" ON "auth_tokens"("userId", "purpose", "createdAt");
CREATE INDEX "auth_tokens_expiresAt_usedAt_idx" ON "auth_tokens"("expiresAt", "usedAt");
CREATE INDEX "security_rate_limits_scope_expiresAt_idx" ON "security_rate_limits"("scope", "expiresAt");
CREATE INDEX "security_rate_limits_expiresAt_idx" ON "security_rate_limits"("expiresAt");
CREATE UNIQUE INDEX "workspace_memberships_businessId_userId_key" ON "workspace_memberships"("businessId", "userId");
CREATE INDEX "workspace_memberships_userId_isActive_idx" ON "workspace_memberships"("userId", "isActive");
CREATE INDEX "workspace_memberships_businessId_role_isActive_idx" ON "workspace_memberships"("businessId", "role", "isActive");
CREATE UNIQUE INDEX "team_invites_tokenHash_key" ON "team_invites"("tokenHash");
CREATE INDEX "team_invites_businessId_createdAt_idx" ON "team_invites"("businessId", "createdAt");
CREATE INDEX "team_invites_email_expiresAt_idx" ON "team_invites"("email", "expiresAt");
CREATE INDEX "feedback_businessId_status_createdAt_idx" ON "feedback"("businessId", "status", "createdAt");
CREATE INDEX "feedback_status_createdAt_idx" ON "feedback"("status", "createdAt");
CREATE UNIQUE INDEX "activation_events_businessId_type_key" ON "activation_events"("businessId", "type");
CREATE INDEX "activation_events_type_createdAt_idx" ON "activation_events"("type", "createdAt");
CREATE INDEX "users_status_createdAt_idx" ON "users"("status", "createdAt");
CREATE INDEX "users_lastSeenAt_idx" ON "users"("lastSeenAt");
CREATE INDEX "businesses_widgetAllowedOrigin_idx" ON "businesses"("widgetAllowedOrigin");
CREATE INDEX "whatsapp_conversations_businessId_assignedToUserId_status_idx" ON "whatsapp_conversations"("businessId", "assignedToUserId", "status");

ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activation_events" ADD CONSTRAINT "activation_events_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve current owner access and make the new membership model immediately useful.
INSERT INTO "workspace_memberships" ("id", "businessId", "userId", "role", "isActive", "createdAt", "updatedAt")
SELECT CONCAT('owner:', "id"), "id", "userId", 'OWNER'::"WorkspaceRole", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "businesses"
ON CONFLICT ("businessId", "userId") DO NOTHING;
