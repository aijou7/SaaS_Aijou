import { randomBytes } from "node:crypto";

export function resolveWhatsAppVerifyToken({
  existing,
  incoming,
  isActive,
  generate = () => randomBytes(32).toString("base64url"),
}: {
  existing: string | null;
  incoming: string | null | undefined;
  isActive: boolean;
  generate?: () => string;
}) {
  const supplied = cleanOptional(incoming);
  if (supplied && supplied.length > 4_096) {
    throw new Error("verify token terlalu panjang.");
  }

  if (supplied) return supplied;

  const stored = cleanOptional(existing);
  if (stored && stored.length >= 16) return stored;

  return isActive ? generate() : null;
}

function cleanOptional(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
