-- CreateTable
CREATE TABLE "agent_settings" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL DEFAULT 'AI Assistant',
    "tone" TEXT NOT NULL DEFAULT 'friendly',
    "language" TEXT NOT NULL DEFAULT 'id',
    "openingMessage" TEXT,
    "closingMessage" TEXT,
    "businessDescription" TEXT,
    "handoffRules" TEXT,
    "systemInstruction" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_settings_businessId_key" ON "agent_settings"("businessId");

-- AddForeignKey
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
