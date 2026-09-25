import { normalizeWhatsAppPhone } from "@/server/whatsapp/phone";

export function isAuthorizedBusinessNumberMessage(
  from: string | undefined,
  businessPhoneNumber?: string,
) {
  const sender = normalizePhoneNumber(from);
  const business = normalizePhoneNumber(businessPhoneNumber);
  return Boolean(sender && business && sender === business);
}

function normalizePhoneNumber(value?: string) {
  const defaultCountryCode = /^\d{1,4}$/.test(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "")
    ? process.env.WHATSAPP_DEFAULT_COUNTRY_CODE!
    : "62";
  const normalized = normalizeWhatsAppPhone(value ?? "", defaultCountryCode);
  return normalized.length >= 7 ? normalized : "";
}
