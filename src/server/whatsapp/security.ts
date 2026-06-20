import { createHmac, timingSafeEqual } from "node:crypto";
import { getActiveWhatsAppAppSecrets } from "@/server/whatsapp/settings";

const signatureHeader = "x-hub-signature-256";

export async function verifyWhatsAppSignature(params: {
  body: string;
  signature: string | null;
}) {
  const appSecrets = await getActiveWhatsAppAppSecrets();

  if (appSecrets.length === 0) {
    return true;
  }

  if (!params.signature?.startsWith("sha256=")) {
    return false;
  }

  const providedBuffer = Buffer.from(params.signature);

  return appSecrets.some((appSecret) => {
    const expected = `sha256=${createHmac("sha256", appSecret)
      .update(params.body)
      .digest("hex")}`;
    const expectedBuffer = Buffer.from(expected);

    return (
      providedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(providedBuffer, expectedBuffer)
    );
  });
}

export { signatureHeader };
