CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED');
CREATE TYPE "ComplaintPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "BroadcastRecipientStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'PROCESSING', 'READY', 'SHIPPED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'QUOTED', 'READY', 'SHIPPED', 'DELIVERED', 'CANCELLED');
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

ALTER TABLE "agent_settings"
  ADD COLUMN "businessHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "businessHours" JSONB,
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Asia/Makassar',
  ADD COLUMN "afterHoursMode" TEXT NOT NULL DEFAULT 'HANDOFF',
  ADD COLUMN "afterHoursMessage" TEXT;

ALTER TABLE "contacts"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "marketingOptInAt" TIMESTAMP(3),
  ADD COLUMN "marketingOptOutAt" TIMESTAMP(3),
  ADD COLUMN "lastContactedAt" TIMESTAMP(3);
CREATE INDEX "contacts_businessId_marketingOptInAt_marketingOptOutAt_idx" ON "contacts"("businessId", "marketingOptInAt", "marketingOptOutAt");

CREATE TABLE "customer_segments" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "color" TEXT NOT NULL DEFAULT '#2563eb', "criteria" JSONB,
  "isDynamic" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customer_segments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_segments_businessId_name_key" ON "customer_segments"("businessId", "name");
CREATE INDEX "customer_segments_businessId_createdAt_idx" ON "customer_segments"("businessId", "createdAt");

CREATE TABLE "contact_segments" (
  "contactId" TEXT NOT NULL, "segmentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contact_segments_pkey" PRIMARY KEY ("contactId", "segmentId")
);
CREATE INDEX "contact_segments_segmentId_createdAt_idx" ON "contact_segments"("segmentId", "createdAt");

CREATE TABLE "complaints" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "ticketNumber" TEXT NOT NULL,
  "contactId" TEXT, "conversationId" TEXT, "assignedToUserId" TEXT,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "category" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "priority" "ComplaintPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
  "slaDueAt" TIMESTAMP(3), "firstResponseAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3), "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "complaints_businessId_ticketNumber_key" ON "complaints"("businessId", "ticketNumber");
CREATE INDEX "complaints_businessId_status_priority_createdAt_idx" ON "complaints"("businessId", "status", "priority", "createdAt");
CREATE INDEX "complaints_businessId_slaDueAt_idx" ON "complaints"("businessId", "slaDueAt");

CREATE TABLE "complaint_events" (
  "id" TEXT NOT NULL, "complaintId" TEXT NOT NULL, "actorId" TEXT, "type" TEXT NOT NULL,
  "note" TEXT, "metadata" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "complaint_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "complaint_events_complaintId_createdAt_idx" ON "complaint_events"("complaintId", "createdAt");

CREATE TABLE "broadcast_campaigns" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "segmentId" TEXT, "name" TEXT NOT NULL,
  "templateName" TEXT NOT NULL, "languageCode" TEXT NOT NULL DEFAULT 'id', "bodyParameters" JSONB,
  "status" "BroadcastStatus" NOT NULL DEFAULT 'DRAFT', "scheduledAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "totalRecipients" INTEGER NOT NULL DEFAULT 0, "sentCount" INTEGER NOT NULL DEFAULT 0, "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcast_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "broadcast_campaigns_businessId_status_createdAt_idx" ON "broadcast_campaigns"("businessId", "status", "createdAt");
CREATE INDEX "broadcast_campaigns_status_scheduledAt_idx" ON "broadcast_campaigns"("status", "scheduledAt");

CREATE TABLE "broadcast_recipients" (
  "id" TEXT NOT NULL, "campaignId" TEXT NOT NULL, "contactId" TEXT NOT NULL, "phoneNumber" TEXT NOT NULL,
  "status" "BroadcastRecipientStatus" NOT NULL DEFAULT 'PENDING', "providerMessageId" TEXT, "errorCode" TEXT,
  "sentAt" TIMESTAMP(3), "deliveredAt" TIMESTAMP(3), "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "broadcast_recipients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "broadcast_recipients_campaignId_contactId_key" ON "broadcast_recipients"("campaignId", "contactId");
CREATE INDEX "broadcast_recipients_campaignId_status_createdAt_idx" ON "broadcast_recipients"("campaignId", "status", "createdAt");
CREATE INDEX "broadcast_recipients_providerMessageId_idx" ON "broadcast_recipients"("providerMessageId");

CREATE TABLE "orders" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "orderNumber" TEXT NOT NULL,
  "contactId" TEXT, "conversationId" TEXT, "customerName" TEXT NOT NULL, "customerPhone" TEXT, "customerEmail" TEXT,
  "shippingAddress" TEXT, "shippingZone" TEXT, "shippingService" TEXT, "weightGrams" INTEGER NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(14,2) NOT NULL, "shippingCost" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0, "totalAmount" DECIMAL(14,2) NOT NULL, "currency" TEXT NOT NULL DEFAULT 'IDR',
  "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT', "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  "shipmentStatus" "ShipmentStatus" NOT NULL DEFAULT 'PENDING', "trackingNumber" TEXT, "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "orders_businessId_orderNumber_key" ON "orders"("businessId", "orderNumber");
CREATE INDEX "orders_businessId_status_createdAt_idx" ON "orders"("businessId", "status", "createdAt");
CREATE INDEX "orders_businessId_customerPhone_idx" ON "orders"("businessId", "customerPhone");

CREATE TABLE "order_items" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "productId" TEXT, "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1, "unitPrice" DECIMAL(14,2) NOT NULL, "subtotal" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

CREATE TABLE "shipping_rates" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "zoneName" TEXT NOT NULL, "serviceName" TEXT NOT NULL,
  "minWeightGrams" INTEGER NOT NULL DEFAULT 0, "maxWeightGrams" INTEGER,
  "basePrice" DECIMAL(14,2) NOT NULL, "pricePerKg" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "estimatedDays" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "shipping_rates_businessId_zoneName_serviceName_minWeightGrams_key" ON "shipping_rates"("businessId", "zoneName", "serviceName", "minWeightGrams");
CREATE INDEX "shipping_rates_businessId_isActive_zoneName_idx" ON "shipping_rates"("businessId", "isActive", "zoneName");

CREATE TABLE "automation_workflows" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "triggerType" TEXT NOT NULL, "steps" JSONB NOT NULL, "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
  "runCount" INTEGER NOT NULL DEFAULT 0, "lastRunAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "automation_workflows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "automation_workflows_businessId_name_key" ON "automation_workflows"("businessId", "name");
CREATE INDEX "automation_workflows_businessId_status_triggerType_idx" ON "automation_workflows"("businessId", "status", "triggerType");

CREATE TABLE "automation_runs" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "workflowId" TEXT NOT NULL, "triggerType" TEXT NOT NULL,
  "context" JSONB NOT NULL, "result" JSONB, "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
  "error" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3),
  CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "automation_runs_businessId_status_startedAt_idx" ON "automation_runs"("businessId", "status", "startedAt");
CREATE INDEX "automation_runs_workflowId_startedAt_idx" ON "automation_runs"("workflowId", "startedAt");

ALTER TABLE "customer_segments" ADD CONSTRAINT "customer_segments_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_segments" ADD CONSTRAINT "contact_segments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contact_segments" ADD CONSTRAINT "contact_segments_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "customer_segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "complaint_events" ADD CONSTRAINT "complaint_events_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_campaigns" ADD CONSTRAINT "broadcast_campaigns_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "customer_segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "broadcast_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "broadcast_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_workflows" ADD CONSTRAINT "automation_workflows_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "automation_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
