import { createHmac } from "node:crypto";
import {
  WhatsAppTemplatePurpose,
  WhatsAppTemplateStatus,
} from "@/generated/prisma-beta/client";
import { getWhatsAppCredentialsForBusiness } from "@/server/whatsapp/settings";
import {
  fetchWhatsAppGraph,
  isWhatsAppAbortError,
  readWhatsAppGraphResponse,
  whatsAppGraphApiUrl,
} from "@/server/whatsapp/graph-api";

const pageSize = "100";
const maxPages = 3;

export type MetaWhatsAppTemplate = {
  id: string;
  name: string;
  purpose: WhatsAppTemplatePurpose;
  languageCode: string;
  title: string | null;
  body: string;
  headerImageUrl: null;
  status: WhatsAppTemplateStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  source: "META";
};

export type MetaWhatsAppTemplateResult = {
  templates: MetaWhatsAppTemplate[];
  error: string | null;
  truncated: boolean;
};

type MetaTemplateRecord = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  category?: unknown;
  language?: unknown;
  rejected_reason?: unknown;
  components?: unknown;
};

export async function listMetaWhatsAppTemplates(
  businessId: string,
): Promise<MetaWhatsAppTemplateResult> {
  const credentials = await getWhatsAppCredentialsForBusiness(businessId);

  if (!credentials.wabaId || !credentials.accessToken) {
    return { templates: [], error: null, truncated: false };
  }

  const appSecretProof = credentials.appSecret
    ? createHmac("sha256", credentials.appSecret)
        .update(credentials.accessToken)
        .digest("hex")
    : null;
  const templates: MetaWhatsAppTemplate[] = [];
  let after: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({
      fields: "id,name,status,category,language,components,rejected_reason",
      limit: pageSize,
    });
    if (appSecretProof) query.set("appsecret_proof", appSecretProof);
    if (after) query.set("after", after);

    try {
      const response = await fetchWhatsAppGraph(
        whatsAppGraphApiUrl(
          `${encodeURIComponent(credentials.wabaId)}/message_templates?${query.toString()}`,
        ),
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            Accept: "application/json",
          },
        },
      );
      const body = await readWhatsAppGraphResponse(response);

      if (!response.ok) {
        const errorCode = readMetaErrorCode(body);
        console.error("whatsapp_templates_sync_failed", {
          businessId,
          status: response.status,
          errorCode,
        });
        return {
          templates: [],
          error: metaSyncError(response.status),
          truncated: false,
        };
      }

      if (!isRecord(body) || !Array.isArray(body.data)) {
        console.error("whatsapp_templates_sync_failed", {
          businessId,
          reason: "invalid_response",
        });
        return {
          templates: [],
          error: "Meta mengembalikan format template yang tidak dikenali. Coba refresh beberapa saat lagi.",
          truncated: false,
        };
      }

      templates.push(...readMetaTemplates(body));
      after = readNextCursor(body);
      if (!after) break;
    } catch (error) {
      console.error("whatsapp_templates_sync_failed", {
        businessId,
        reason: isWhatsAppAbortError(error) ? "timeout" : "network_error",
      });
      return {
        templates: [],
        error: "Template Meta belum bisa disinkronkan. Coba refresh beberapa saat lagi.",
        truncated: false,
      };
    }
  }

  return { templates, error: null, truncated: Boolean(after) };
}

function readMetaTemplates(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.data)) return [];

  return body.data.flatMap((item) => {
    const template = toMetaTemplate(item);
    return template ? [template] : [];
  });
}

function toMetaTemplate(value: unknown): MetaWhatsAppTemplate | null {
  if (!isRecord(value)) return null;

  const record = value as MetaTemplateRecord;
  const name = readText(record.name, 512);
  if (!name) return null;

  const components = readComponents(record.components);
  const header = components.find(
    (component) => component.type === "HEADER" && component.format === "TEXT",
  );
  const body = components.find((component) => component.type === "BODY");
  const languageCode = readText(record.language, 32) ?? "id";
  const providerId = readText(record.id, 160) ?? `${name}:${languageCode}`;

  return {
    id: `meta:${providerId}`,
    name,
    purpose: mapPurpose(record.category),
    languageCode,
    title: header?.text ?? null,
    body: body?.text ?? "Template Meta tanpa isi body yang terbaca.",
    headerImageUrl: null,
    status: mapStatus(record.status),
    rejectionReason: readText(record.rejected_reason, 500),
    createdAt: "Meta",
    updatedAt: "Meta",
    source: "META",
  };
}

function readComponents(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const type = readText(item.type, 32)?.toUpperCase();
    if (!type) return [];

    return [
      {
        type,
        format: readText(item.format, 32)?.toUpperCase() ?? null,
        text: readText(item.text, 1_024),
      },
    ];
  });
}

function mapPurpose(value: unknown) {
  const category = readText(value, 32)?.toUpperCase();
  if (category === "MARKETING") return WhatsAppTemplatePurpose.MARKETING;
  if (category === "AUTHENTICATION") return WhatsAppTemplatePurpose.AUTHENTICATION;
  return WhatsAppTemplatePurpose.UTILITY;
}

function mapStatus(value: unknown) {
  const status = readText(value, 64)?.toUpperCase();
  if (status === "APPROVED") return WhatsAppTemplateStatus.APPROVED;
  if (status === "REJECTED" || status === "DISABLED" || status === "DELETED") {
    return WhatsAppTemplateStatus.REJECTED;
  }
  return WhatsAppTemplateStatus.IN_REVIEW;
}

function readNextCursor(body: unknown) {
  if (!isRecord(body) || !isRecord(body.paging) || !isRecord(body.paging.cursors)) {
    return null;
  }

  const after = body.paging.cursors.after;
  return typeof after === "string" && after.length <= 512 ? after : null;
}

function readMetaErrorCode(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const code = body.error.code;
  return typeof code === "number" || typeof code === "string" ? String(code).slice(0, 40) : null;
}

function metaSyncError(status: number) {
  if (status === 401) return "Token Meta tidak valid atau sudah kedaluwarsa. Periksa koneksi WhatsApp.";
  if (status === 403) return "Token Meta belum memiliki izin untuk membaca template WhatsApp.";
  return "Template Meta belum bisa disinkronkan. Periksa koneksi WhatsApp lalu coba refresh.";
}

function readText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, maxLength);
  return text || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
