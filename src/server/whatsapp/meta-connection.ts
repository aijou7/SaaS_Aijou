import { createHmac } from "node:crypto";
import {
  fetchWhatsAppGraph,
  isWhatsAppAbortError,
  readWhatsAppGraphResponse,
  whatsAppGraphApiUrl,
} from "@/server/whatsapp/graph-api";

type ConnectWhatsAppParams = {
  accessToken: string;
  appSecret: string;
  wabaId: string;
  phoneNumberId: string;
  webhookUrl: string;
  verifyToken: string;
};

type PhoneNumberRecord = {
  id?: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
};

export type WhatsAppConnectionResult =
  | {
      ok: true;
      phone: {
        id: string;
        displayPhoneNumber: string | null;
        verifiedName: string | null;
        qualityRating: string | null;
      };
    }
  | {
      ok: false;
      reason:
        | "meta_invalid_token"
        | "meta_app_secret_mismatch"
        | "meta_permission_missing"
        | "meta_waba_not_found"
        | "meta_phone_number_mismatch"
        | "meta_webhook_subscription_failed"
        | "meta_invalid_response"
        | "meta_unavailable";
      status?: number;
    };

type WhatsAppConnectionFailureReason = Extract<
  WhatsAppConnectionResult,
  { ok: false }
>["reason"];

export async function connectWhatsAppCloudApi(
  params: ConnectWhatsAppParams,
): Promise<WhatsAppConnectionResult> {
  try {
    const phoneResponse = await fetchWhatsAppGraph(
      whatsAppGraphApiUrl(
        `${encodeURIComponent(params.wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&limit=100`,
      ),
      {
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          Accept: "application/json",
        },
      },
    );
    const phoneBody = await readWhatsAppGraphResponse(phoneResponse);

    if (!phoneResponse.ok) {
      return {
        ok: false,
        reason: mapMetaFailure(phoneResponse.status, phoneBody, "meta_waba_not_found"),
        status: phoneResponse.status,
      };
    }

    const phone = extractPhoneNumber(phoneBody, params.phoneNumberId);
    if (!phone) {
      return { ok: false, reason: "meta_phone_number_mismatch" };
    }

    const appSecretProof = createHmac("sha256", params.appSecret)
      .update(params.accessToken)
      .digest("hex");
    const subscriptionResponse = await fetchWhatsAppGraph(
      whatsAppGraphApiUrl(
        `${encodeURIComponent(params.wabaId)}/subscribed_apps?appsecret_proof=${appSecretProof}`,
      ),
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          override_callback_uri: params.webhookUrl,
          verify_token: params.verifyToken,
        }),
      },
    );
    const subscriptionBody = await readWhatsAppGraphResponse(subscriptionResponse);

    if (!subscriptionResponse.ok) {
      const mappedFailure = mapMetaFailure(
        subscriptionResponse.status,
        subscriptionBody,
        "meta_webhook_subscription_failed",
      );
      return {
        ok: false,
        reason:
          mappedFailure === "meta_invalid_token"
            ? "meta_app_secret_mismatch"
            : mappedFailure,
        status: subscriptionResponse.status,
      };
    }

    if (!isSuccessfulSubscriptionResponse(subscriptionBody)) {
      return { ok: false, reason: "meta_invalid_response", status: subscriptionResponse.status };
    }

    return {
      ok: true,
      phone: {
        id: params.phoneNumberId,
        displayPhoneNumber: cleanMetaText(phone.display_phone_number),
        verifiedName: cleanMetaText(phone.verified_name),
        qualityRating: cleanMetaText(phone.quality_rating),
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: isWhatsAppAbortError(error) ? "meta_unavailable" : "meta_unavailable",
    };
  }
}

function extractPhoneNumber(body: unknown, phoneNumberId: string) {
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
    return null;
  }

  return (
    body.data.find(
      (item): item is PhoneNumberRecord =>
        Boolean(
          item &&
            typeof item === "object" &&
            "id" in item &&
            String(item.id) === phoneNumberId,
        ),
    ) ?? null
  );
}

function isSuccessfulSubscriptionResponse(body: unknown) {
  if (!body || typeof body !== "object") return false;
  if ("success" in body && body.success === true) return true;
  return "data" in body && Array.isArray(body.data);
}

function mapMetaFailure(
  status: number,
  body: unknown,
  fallback: WhatsAppConnectionFailureReason,
) {
  const errorCode = extractMetaErrorCode(body);
  if (status === 401 || errorCode === 190) return "meta_invalid_token" as const;
  if (status === 403 || errorCode === 10 || errorCode === 200) {
    return "meta_permission_missing" as const;
  }
  if (status === 404 || errorCode === 100) return "meta_waba_not_found" as const;
  return fallback;
}

function extractMetaErrorCode(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = Number(error.code);
  return Number.isFinite(code) ? code : null;
}

function cleanMetaText(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}
