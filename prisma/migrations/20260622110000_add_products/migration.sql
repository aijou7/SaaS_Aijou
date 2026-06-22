CREATE TABLE IF NOT EXISTS "products" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "price" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'IDR',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "products_businessId_name_key" ON "products"("businessId", "name");
CREATE INDEX IF NOT EXISTS "products_businessId_isActive_sortOrder_idx" ON "products"("businessId", "isActive", "sortOrder");

DO $$ BEGIN
  ALTER TABLE "products"
    ADD CONSTRAINT "products_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
