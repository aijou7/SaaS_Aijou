-- Explicitly approved internal Aijou operator account.
-- Existing credentials are preserved; a missing account starts with an
-- intentionally unusable credential and must use the password-reset flow.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE LOWER("email") = 'contact@aijoutek.pro'
  ) THEN
    UPDATE "users"
    SET
      "isPlatformAdmin" = true,
      "status" = 'ACTIVE',
      "emailVerifiedAt" = COALESCE("emailVerifiedAt", CURRENT_TIMESTAMP),
      "suspendedAt" = NULL,
      "deletionRequestedAt" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE LOWER("email") = 'contact@aijoutek.pro';
  ELSE
    INSERT INTO "users" (
      "id",
      "name",
      "email",
      "passwordHash",
      "role",
      "status",
      "isPlatformAdmin",
      "emailVerifiedAt",
      "signupSource",
      "createdAt",
      "updatedAt"
    ) VALUES (
      'platform_contact_aijoutek_pro',
      'Aijou Developer',
      'contact@aijoutek.pro',
      'aijou-login-dummy-salt:4b3a26033e1527a3d5e298bcc8fc42a3167afac6c931f2ab9565e6f1326cd804068fc2de571c131c891bfd88a178a53ae12cedb9941e74b6ad19edd82b283754',
      'OWNER',
      'ACTIVE',
      true,
      CURRENT_TIMESTAMP,
      'INTERNAL',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
