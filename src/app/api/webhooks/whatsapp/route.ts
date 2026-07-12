import { createHash } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma-beta/client";
import {
  noStoreHeaders,
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "@/lib/request-security";
import {
  enqueueWhatsAppWebhook,
  processPendingJobs,
} from "@/server/jobs/background-jobs";
import type { WhatsAppWebhookPayload } from "@/server/whatsapp/payload";
import {
  getWhatsAppWebhookPhoneNumberId,
  signatureHeader,
  verifyWhatsAppSignature,
} from "@/server/whatsapp/security";
import {
  getWhatsAppAppSecretForPhoneNumberId,
  findWhatsAppSettingsByIdentifier,
  isAnyVerifyTokenValid,
} from "@/server/whatsapp/settings";

export const maxDuration = 60;

const maxWebhookBodyBytes = 2 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    (await isAnyVerifyTokenValid(token)) &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200, headers: noStoreHeaders });
  }

  return NextResponse.json(
    { error: "Invalid verification token" },
    { status: 403, headers: noStoreHeaders },
  );
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json(
      { error: "Unsupported content type" },
      { status: 415, headers: noStoreHeaders },
    );
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRequestBodyBuffer(request, maxWebhookBodyBytes);
  } catch (error) {
    const tooLarge = error instanceof RequestBodyTooLargeError;
    return NextResponse.json(
      { error: tooLarge ? "Webhook payload too large" : "Invalid webhook request" },
      { status: tooLarge ? 413 : 400, headers: noStoreHeaders },
    );
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const phoneNumberId = getWhatsAppWebhookPhoneNumberId(payload);
  if (!phoneNumberId) {
    return NextResponse.json(
      { error: "Unknown WhatsApp destination" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let appSecret: string | null;
  try {
    appSecret = await getWhatsAppAppSecretForPhoneNumberId(phoneNumberId);
  } catch (error) {
    console.error("WhatsApp webhook secret lookup failed", error);
    return NextResponse.json(
      { error: "Webhook configuration unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (
    !verifyWhatsAppSignature({
      body: rawBody,
      signature: request.headers.get(signatureHeader),
      appSecret,
    })
  ) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  try {
    const settings = await findWhatsAppSettingsByIdentifier([phoneNumberId]);
    if (!settings) {
      return NextResponse.json(
        { error: "WhatsApp workspace unavailable" },
        { status: 503, headers: noStoreHeaders },
      );
    }

    const job = await enqueueWhatsAppWebhook({
      businessId: settings.businessId,
      payload: payload as unknown as Prisma.InputJsonValue,
      payloadDigest: createHash("sha256").update(rawBody).digest("hex"),
    });
    after(async () => {
      await processPendingJobs(2);
    });

    return NextResponse.json(
      {
        received: true,
        queued: true,
        jobStatus: job.status,
      },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("WhatsApp webhook processing failed", error);

    return NextResponse.json(
      { received: true, processed: 0, error: "webhook_processing_failed" },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
