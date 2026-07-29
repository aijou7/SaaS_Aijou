export const whatsAppCustomerCareWindowMs = 24 * 60 * 60_000;

export function isWhatsAppCustomerCareWindowOpen(
  lastCustomerMessageAt: Date | string | null | undefined,
  now: Date | string = new Date(),
) {
  if (!lastCustomerMessageAt) return false;
  const lastMs = new Date(lastCustomerMessageAt).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(lastMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - lastMs;
  return age >= 0 && age < whatsAppCustomerCareWindowMs;
}
