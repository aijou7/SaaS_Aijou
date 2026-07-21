export class PublicSignupError extends Error {
  constructor(
    message: string,
    readonly code:
      | "DISABLED"
      | "INVALID_INPUT"
      | "DUPLICATE"
      | "RATE_LIMITED"
      | "FAILED" = "INVALID_INPUT",
  ) {
    super(message);
    this.name = "PublicSignupError";
  }
}

export type PublicSignupInput = {
  name: string;
  email: string;
  phoneNumber?: string;
  businessName: string;
};

export type NormalizedPublicSignupInput = {
  name: string;
  email: string;
  phoneNumber: string | null;
  businessName: string;
};

export const publicSignupRateRules = [
  { subject: "ip", scope: "ip:15m", max: 8, windowMs: 15 * 60_000 },
  { subject: "ip", scope: "ip:24h", max: 30, windowMs: 24 * 60 * 60_000 },
  { subject: "email", scope: "email:1h", max: 5, windowMs: 60 * 60_000 },
  { subject: "email", scope: "email:24h", max: 10, windowMs: 24 * 60 * 60_000 },
] as const;

export function isPublicSignupEnabled(value = process.env.PUBLIC_SIGNUP_ENABLED) {
  if (!value) return true;
  return !["0", "false", "off", "disabled", "no"].includes(
    value.trim().toLowerCase(),
  );
}

export function isPublicSignupReady(
  emailConfigured: boolean,
  value = process.env.PUBLIC_SIGNUP_ENABLED,
) {
  return emailConfigured && isPublicSignupEnabled(value);
}

export function normalizePublicSignupInput(
  input: PublicSignupInput,
): NormalizedPublicSignupInput {
  const name = cleanRequiredText(input.name, 2, 100, "Nama lengkap");
  const email = normalizeEmail(input.email);
  const businessName = cleanRequiredText(
    input.businessName,
    2,
    120,
    "Nama bisnis",
  );
  const phoneNumber = normalizePhone(input.phoneNumber);

  return { name, email, phoneNumber, businessName };
}

function cleanRequiredText(
  value: string | null | undefined,
  minimum: number,
  maximum: number,
  label: string,
) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  if (normalized.length < minimum) {
    throw new PublicSignupError(`${label} minimal ${minimum} karakter.`);
  }
  if (normalized.length > maximum) {
    throw new PublicSignupError(`${label} maksimal ${maximum} karakter.`);
  }
  if (/\p{C}/u.test(normalized)) {
    throw new PublicSignupError(`${label} memuat karakter yang tidak didukung.`);
  }
  return normalized;
}

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new PublicSignupError("Email tidak valid.");
  }
  return email;
}

function normalizePhone(value: string | null | undefined) {
  const phone = value?.trim().replace(/[^\d+]/g, "") ?? "";
  if (!phone) return null;
  const normalized = phone.startsWith("+") ? phone.slice(1) : phone;
  if (!/^\d{8,18}$/.test(normalized)) {
    throw new PublicSignupError("Nomor WhatsApp owner tidak valid.");
  }
  return normalized;
}
