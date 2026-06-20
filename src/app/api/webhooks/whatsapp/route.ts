import { NextRequest, NextResponse } from "next/server";
import { processIncomingWhatsAppWebhook } from "@/server/whatsapp/processor";
import { sendWhatsAppTextMessage } from "@/server/whatsapp/client";
import { signatureHeader, verifyWhatsAppSignature } from "@/server/whatsapp/security";
import { isAnyVerifyTokenValid } from "@/server/whatsapp/settings";

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
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Invalid verification token" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    if (
      !(await verifyWhatsAppSignature({
        body: rawBody,
        signature: request.headers.get(signatureHeader),
      }))
    ) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const payload = JSON.parse(rawBody);
    const result = await processIncomingWhatsAppWebhook(payload);
    const replies = await Promise.all(
      collectReplies(result.messages).map((message) =>
        sendWhatsAppTextMessage({
          to: message.to,
          body: message.body,
          businessId: message.businessId,
        }),
      ),
    );

    return NextResponse.json({ ...result, replies }, { status: 200 });
  } catch (error) {
    console.error("WhatsApp webhook processing failed", error);

    return NextResponse.json(
      {
        received: true,
        processed: 0,
        error: "webhook_processing_failed",
      },
      { status: 200 },
    );
  }
}

function collectReplies(
  messages:
    | Array<{ from?: string; reply?: string | null; storage?: unknown }>
    | undefined,
) {
  const replies: Array<{ to: string; body: string; businessId?: string }> = [];

  for (const message of messages ?? []) {
    if (message.from && message.reply) {
      replies.push({
        to: message.from,
        body: message.reply,
        businessId: getStorageBusinessId(message.storage),
      });
    }
  }

  return replies;
}

function getStorageBusinessId(storage: unknown) {
  if (
    storage &&
    typeof storage === "object" &&
    "businessId" in storage &&
    typeof storage.businessId === "string"
  ) {
    return storage.businessId;
  }

  return undefined;
}
