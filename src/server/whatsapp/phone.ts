/**
 * Convert common Indonesian phone number formats into the international,
 * digits-only format used by the WhatsApp Cloud API.
 */
export function normalizeWhatsAppPhone(value: string, defaultCountryCode = "62") {
  const digits = value.replace(/\D/g, "");
  let normalized = digits.startsWith("00") ? digits.slice(2) : digits;
  const countryCode = /^\d{1,4}$/.test(defaultCountryCode) ? defaultCountryCode : "62";

  if (normalized.startsWith("0")) {
    normalized = `${countryCode}${normalized.slice(1)}`;
  }

  return normalized;
}
