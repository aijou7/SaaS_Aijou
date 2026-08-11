-- Explicitly approved internal Aijou operator account.
-- Ordinary workspace owners remain tenant-scoped.
UPDATE "users"
SET
  "isPlatformAdmin" = true,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE LOWER("email") = 'contact@aijoutek.pro';
