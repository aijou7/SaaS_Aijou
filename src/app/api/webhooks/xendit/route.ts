import { NextRequest, NextResponse } from "next/server";
import {
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "@/lib/request-security";
import { handleXenditWebhook } from "@/server/payments/payments";

const maxWebhookBytes = 256 * 1024;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxWebhookBytes) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const raw = await readRequestBodyBuffer(request, maxWebhookBytes);
    const payload = JSON.parse(raw.toString("utf8")) as unknown;
    const result = await handleXenditWebhook({
      token: request.headers.get("x-callback-token"),
      payload,
    });
    return NextResponse.json(
      result.accepted ? { received: true } : { error: result.reason },
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    console.error("xendit_webhook_failed", {
      code:
        error && typeof error === "object" && "code" in error && typeof error.code === "string"
          ? error.code.slice(0, 48)
          : "unknown",
    });
    return NextResponse.json(
      { error: "invalid_webhook" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
