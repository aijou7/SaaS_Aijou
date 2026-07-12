import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const encryptionPrefix = "enc:v1:";

export function encryptSecret(value: string | null, context: string) {
  if (!value) return null;

  const key = getEncryptionKey();
  if (!key) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    encryptionPrefix.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string | null, context: string) {
  if (!value || !value.startsWith(encryptionPrefix)) return value;

  const key = getEncryptionKey(true);
  const parts = value.split(":");

  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Encrypted secret format is invalid.");
  }

  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const encrypted = Buffer.from(parts[4], "base64url");

  if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
    throw new Error("Encrypted secret payload is invalid.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value: string | null) {
  return Boolean(value?.startsWith(encryptionPrefix));
}

function getEncryptionKey(required: true): Buffer;
function getEncryptionKey(required?: false): Buffer | null;
function getEncryptionKey(required = false): Buffer | null {
  const configured = process.env.DATA_ENCRYPTION_KEY?.trim();

  if (!configured) {
    if (required || process.env.NODE_ENV === "production") {
      throw new Error("DATA_ENCRYPTION_KEY is required to protect integration credentials.");
    }

    return null;
  }

  const key = /^[a-f0-9]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64url");

  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}
