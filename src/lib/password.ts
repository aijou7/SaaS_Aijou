import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const minimumPasswordLength = 12;
const maximumPasswordLength = 128;

export const dummyPasswordHash =
  "aijou-login-dummy-salt:4b3a26033e1527a3d5e298bcc8fc42a3167afac6c931f2ab9565e6f1326cd804068fc2de571c131c891bfd88a178a53ae12cedb9941e74b6ad19edd82b283754";

export async function hashPassword(password: string) {
  if (!password || password.length > maximumPasswordLength) {
    throw new Error("Password tidak valid.");
  }

  const salt = randomBytes(16).toString("hex");
  const hash = await deriveKey(password, salt);

  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  if (!password || password.length > maximumPasswordLength) {
    return false;
  }

  const [salt, hash, ...extra] = storedHash.split(":");

  if (!salt || !hash || extra.length > 0 || !/^[a-f0-9]{128}$/i.test(hash)) {
    return false;
  }

  try {
    const passwordHash = await deriveKey(password, salt);
    const storedPasswordHash = Buffer.from(hash, "hex");

    return (
      passwordHash.length === storedPasswordHash.length &&
      timingSafeEqual(passwordHash, storedPasswordHash)
    );
  } catch {
    return false;
  }
}

export function getPasswordVersion(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("base64url");
}

export function validatePasswordStrength(password: string, email?: string) {
  if (password.length < minimumPasswordLength) {
    return `Password minimal ${minimumPasswordLength} karakter.`;
  }

  if (password.length > maximumPasswordLength) {
    return `Password maksimal ${maximumPasswordLength} karakter.`;
  }

  const normalized = password.toLowerCase();
  const localPart = email?.trim().toLowerCase().split("@")[0];
  const weakValues = [
    "change-me-now",
    "password1234",
    "administrator",
    "qwerty123456",
    "aijou123456",
  ];

  if (
    weakValues.includes(normalized) ||
    /^(.)\1+$/.test(password) ||
    (localPart && localPart.length >= 4 && normalized.includes(localPart))
  ) {
    return "Password terlalu mudah ditebak.";
  }

  if (!/[a-z]/i.test(password) || !/\d/.test(password)) {
    return "Password perlu memuat huruf dan angka.";
  }

  return null;
}

function deriveKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}
