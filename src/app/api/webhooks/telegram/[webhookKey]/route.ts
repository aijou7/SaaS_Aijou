import { after, NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma-beta/client";
import {
  noStoreHeaders,
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
} from "@/lib/request-security";
import {
  enqueueTelegramWebhook,
  processPendingJobs,
} from "@/server/jobs/background-jobs";
import {
  isValidTelegramWebhookKey,
  telegramSecretHeader,
  verifyTelegramWebhookSecret,
} from "@/server/telegram/security";
import {
  extractTelegramInboundMessage,
  type TelegramUpdate,
} from "@/server/telegram/payload";
import { findTelegramWebhookSettingsByKey } from "@/server/telegram/settings";

export const maxDuration = 60;

const maxTelegramWebhookBytes = 512 * 1024;

type TelegramWebhookRouteContext = {
  params: Promise<{ webhookKey: string }>;
};

export async function POST(request: NextRequest, context: TelegramWebhookRouteContext) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return NextResponse.json(
      { error: "Unsupported content type" },
      { status: 415, headers: noStoreHeaders },
    );
  }

  const { webhookKey } = await context.params;
  if (!isValidTelegramWebhookKey(webhookKey)) {
    return NextResponse.json(
      { error: "Webhook not found" },
      { status: 404, headers: noStoreHeaders },
    );
  }

  let settings: Awaited<ReturnType<typeof findTelegramWebhookSettingsByKey>>;
  try {
    settings = await findTelegramWebhookSettingsByKey(webhookKey);
  } catch (error) {
    console.error("Telegram webhook settings unavailable", error);
    return NextResponse.json(
      { error: "Webhook configuration unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (
    !settings?.webhookSecret ||
    !verifyTelegramWebhookSecret(
      settings.webhookSecret,
      request.headers.get(telegramSecretHeader),
    )
  ) {
    return NextResponse.json(
      { error: "Invalid webhook credentials" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  let rawBody: Buffer;
  try {
    rawBody = await readRequestBodyBuffer(request, maxTelegramWebhookBytes);
  } catch (error) {
    const tooLarge = error instanceof RequestBodyTooLargeError;
    return NextResponse.json(
      { error: tooLarge ? "Webhook payload too large" : "Invalid webhook request" },
      { status: tooLarge ? 413 : 400, headers: noStoreHeaders },
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  const updateId = payload.update_id;
  if (typeof updateId !== "number" || !Number.isSafeInteger(updateId) || updateId < 0) {
    return NextResponse.json(
      { error: "Invalid Telegram update" },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (!extractTelegramInboundMessage(payload as TelegramUpdate)) {
    return NextResponse.json(
      { received: true, ignored: true },
      { status: 200, headers: noStoreHeaders },
    );
  }

  try {
    const job = await enqueueTelegramWebhook({
      businessId: settings.businessId,
      payload: payload as Prisma.InputJsonValue,
      updateId: String(updateId),
    });
    after(async () => {
      await processPendingJobs(2);
    });

    return NextResponse.json(
      { received: true, queued: true, jobStatus: job.status },
      { status: 200, headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Telegram webhook enqueue failed", error);
    return NextResponse.json(
      { error: "Webhook temporarily unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }
}
