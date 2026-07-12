import { createHmac, timingSafeEqual } from "node:crypto";

const signatureHeader = "x-hub-signature-256";

export function verifyWhatsAppSignature(params: {
  body: Buffer | string;
  signature: string | null;
  appSecret: string | null;
}) {
  if (!params.appSecret || !params.signature || !/^sha256=[a-f0-9]{64}$/i.test(params.signature)) {
    return false;
  }

  const providedDigest = Buffer.from(params.signature.slice("sha256=".length), "hex");
  const expectedDigest = createHmac("sha256", params.appSecret).update(params.body).digest();

  return (
    providedDigest.length === expectedDigest.length &&
    timingSafeEqual(providedDigest, expectedDigest)
  );
}

export function getWhatsAppWebhookPhoneNumberId(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return null;

  const identifiers = new Set<string>();

  for (const entry of payload.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;

    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const metadata = change.value.metadata;
      if (!isRecord(metadata)) continue;

      const identifier = metadata.phone_number_id;
      if (typeof identifier !== "string" || !/^\d{5,32}$/.test(identifier)) continue;
      identifiers.add(identifier);

      if (identifiers.size > 1) return null;
    }
  }

  return identifiers.size === 1 ? [...identifiers][0] : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export { signatureHeader };
