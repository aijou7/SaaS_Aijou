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

type MetaPermissionRecord = {
  permission?: string;
  status?: string;
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
    const appSecretProof = createHmac("sha256", params.appSecret)
      .update(params.accessToken)
      .digest("hex");
    const phoneQuery = new URLSearchParams({
      fields: "id,display_phone_number,verified_name,quality_rating",
      limit: "100",
      appsecret_proof: appSecretProof,
    });
    const phoneResponse = await fetchWhatsAppGraph(
      whatsAppGraphApiUrl(
        `${encodeURIComponent(params.wabaId)}/phone_numbers?${phoneQuery.toString()}`,
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
      const mappedFailure = mapMetaFailure(phoneResponse.status, phoneBody, "meta_waba_not_found");
      const reason =
        mappedFailure === "meta_waba_not_found"
          ? await refineWabaFailure(params.accessToken, appSecretProof)
          : mappedFailure;
      logMetaFailure("phone_numbers", phoneResponse.status, phoneBody, reason);
      return {
        ok: false,
        reason,
        status: phoneResponse.status,
      };
    }

    const phone = extractPhoneNumber(phoneBody, params.phoneNumberId);
    if (!phone) {
      return { ok: false, reason: "meta_phone_number_mismatch" };
    }

    const initialSubscriptionUrl = whatsAppGraphApiUrl(
      `${encodeURIComponent(params.wabaId)}/subscribed_apps?appsecret_proof=${appSecretProof}`,
    );
    const initialSubscriptionResponse = await fetchWhatsAppGraph(initialSubscriptionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        Accept: "application/json",
      },
    });
    const initialSubscriptionBody = await readWhatsAppGraphResponse(initialSubscriptionResponse);

    if (!initialSubscriptionResponse.ok) {
      const reason = mapMetaFailure(
        initialSubscriptionResponse.status,
        initialSubscriptionBody,
        "meta_webhook_subscription_failed",
      );
      logMetaFailure(
        "subscription",
        initialSubscriptionResponse.status,
        initialSubscriptionBody,
        reason,
      );
      return { ok: false, reason, status: initialSubscriptionResponse.status };
    }

    if (!isSuccessfulSubscriptionResponse(initialSubscriptionBody)) {
      return { ok: false, reason: "meta_invalid_response", status: initialSubscriptionResponse.status };
    }

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
      const reason =
        mappedFailure === "meta_invalid_token"
          ? "meta_app_secret_mismatch"
          : mappedFailure;
      logMetaFailure("subscription", subscriptionResponse.status, subscriptionBody, reason);
      return {
        ok: false,
        reason,
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

async function refineWabaFailure(
  accessToken: string,
  appSecretProof: string,
): Promise<WhatsAppConnectionFailureReason> {
  try {
    const query = new URLSearchParams({ appsecret_proof: appSecretProof });
    const response = await fetchWhatsAppGraph(
      whatsAppGraphApiUrl(`me/permissions?${query.toString()}`),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    const body = await readWhatsAppGraphResponse(response);

    if (!response.ok) {
      return mapMetaFailure(response.status, body, "meta_waba_not_found");
    }

    const granted = extractGrantedPermissions(body);
    if (!granted) return "meta_waba_not_found";

    const required = [
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ];
    return required.every((permission) => granted.has(permission))
      ? "meta_waba_not_found"
      : "meta_permission_missing";
  } catch {
    return "meta_waba_not_found";
  }
}

function extractGrantedPermissions(body: unknown) {
  if (!body || typeof body !== "object" || !("data" in body) || !Array.isArray(body.data)) {
    return null;
  }

  const granted = new Set<string>();
  for (const item of body.data) {
    if (!item || typeof item !== "object") continue;
    const record = item as MetaPermissionRecord;
    if (record.status === "granted" && record.permission) {
      granted.add(record.permission);
    }
  }
  return granted;
}

function logMetaFailure(
  stage: "phone_numbers" | "subscription",
  status: number,
  body: unknown,
  reason: WhatsAppConnectionFailureReason,
) {
  if (process.env.NODE_ENV !== "production") return;
  const metaError = extractMetaError(body);
  console.error("whatsapp_meta_request_failed", {
    stage,
    status,
    reason,
    metaCode: readMetaNumber(metaError, "code"),
    metaSubcode: readMetaNumber(metaError, "error_subcode"),
    metaType: readMetaText(metaError, "type"),
  });
}

function extractMetaError(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  return error && typeof error === "object" ? error as Record<string, unknown> : null;
}

function readMetaNumber(error: Record<string, unknown> | null, field: string) {
  const value = Number(error?.[field]);
  return Number.isFinite(value) ? value : null;
}

function readMetaText(error: Record<string, unknown> | null, field: string) {
  const value = error?.[field];
  return typeof value === "string" ? value.slice(0, 80) : null;
}

function mapMetaFailure(
  status: number,
  body: unknown,
  fallback: WhatsAppConnectionFailureReason,
) {
  const errorCode = extractMetaErrorCode(body);
  if (isAppSecretProofFailure(body)) return "meta_app_secret_mismatch" as const;
  if (status === 401 || errorCode === 190) return "meta_invalid_token" as const;
  if (status === 403 || errorCode === 10 || errorCode === 200) {
    return "meta_permission_missing" as const;
  }
  if (status === 404) return "meta_waba_not_found" as const;
  if (errorCode === 100) return fallback;
  return fallback;
}

function extractMetaErrorCode(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = body.error;
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  const code = Number(error.code);
  return Number.isFinite(code) ? code : null;
}

function isAppSecretProofFailure(body: unknown) {
  if (!body || typeof body !== "object" || !("error" in body)) return false;
  const error = body.error;
  if (!error || typeof error !== "object" || !("message" in error)) return false;
  return String(error.message).toLowerCase().includes("appsecret_proof");
}

function cleanMetaText(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 200) : null;
}
