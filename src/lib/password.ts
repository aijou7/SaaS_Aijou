import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const keyLength = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, keyLength).toString("hex");

  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");

  if (!salt || !hash) {
    return false;
  }

  const passwordHash = Buffer.from(scryptSync(password, salt, keyLength).toString("hex"));
  const storedPasswordHash = Buffer.from(hash);

  return (
    passwordHash.length === storedPasswordHash.length &&
    timingSafeEqual(passwordHash, storedPasswordHash)
  );
}
