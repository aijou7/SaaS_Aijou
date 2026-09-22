import { createHmac } from "node:crypto";
import {
  WhatsAppTemplatePurpose,
  WhatsAppTemplateStatus,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppFormatting } from "@/lib/whatsapp-format";
import { getWhatsAppCredentialsForBusiness } from "@/server/whatsapp/settings";
import {
  fetchWhatsAppGraph,
  isWhatsAppAbortError,
  readWhatsAppGraphResponse,
  whatsAppGraphApiUrl,
} from "@/server/whatsapp/graph-api";

const pageSize = "100";
const maxPages = 3;
const maxTemplateSampleBytes = 5 * 1024 * 1024;

export type MetaWhatsAppTemplate = {
  id: string;
  name: string;
  purpose: WhatsAppTemplatePurpose;
  languageCode: string;
  title: string | null;
  body: string;
  headerImageUrl: string | null;
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

export type ApprovedWhatsAppTemplateOption = {
  name: string;
  languageCode: string;
  title: string | null;
  body: string;
  headerImageUrl: string | null;
};

export type ApprovedWhatsAppTemplateOptionsResult = {
  templates: ApprovedWhatsAppTemplateOption[];
  error: string | null;
};

export type SubmitMetaWhatsAppTemplateInput = {
  name: string;
  purpose: WhatsAppTemplatePurpose;
  languageCode: string;
  title: string | null;
  body: string;
  headerImageUrl: string | null;
};

export type SubmitMetaWhatsAppTemplateResult = {
  id: string | null;
  status: string | null;
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
  let credentials;
  try {
    credentials = await getWhatsAppCredentialsForBusiness(businessId);
  } catch (error) {
    console.error("whatsapp_templates_credentials_failed", {
      businessId,
      reason: error instanceof Error ? error.name : "unknown_error",
    });
    return {
      templates: [],
      error: "Koneksi WhatsApp belum bisa dibaca. Periksa kembali credential WhatsApp di Pengaturan.",
      truncated: false,
    };
  }

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

export async function listApprovedMetaWhatsAppTemplateOptions(
  businessId: string,
): Promise<ApprovedWhatsAppTemplateOptionsResult> {
  const result = await listMetaWhatsAppTemplates(businessId);
  const localTemplates = await prisma.whatsAppTemplate.findMany({
    where: { businessId },
    select: { name: true, languageCode: true, headerImageUrl: true },
  });
  const localByKey = new Map(
    localTemplates.map((template) => [`${template.name.toLowerCase()}::${template.languageCode.toLowerCase()}`, template.headerImageUrl]),
  );

  return {
    error: result.error,
    templates: result.templates
      .filter((template) => template.status === WhatsAppTemplateStatus.APPROVED)
      .map(({ name, languageCode, title, body }) => ({
        name,
        languageCode,
        title,
        body,
        headerImageUrl: localByKey.get(`${name.toLowerCase()}::${languageCode.toLowerCase()}`) ?? null,
      })),
  };
}

export async function requireApprovedMetaWhatsAppTemplate(
  businessId: string,
  templateName: string,
  languageCode: string,
) {
  const result = await listMetaWhatsAppTemplates(businessId);

  if (result.error) {
    throw new Error(result.error);
  }

  const template = result.templates.find(
    (candidate) =>
      candidate.status === WhatsAppTemplateStatus.APPROVED &&
      candidate.name === templateName &&
      candidate.languageCode === languageCode,
  );

  if (!template) {
    throw new Error(
      "Template tidak ditemukan atau belum disetujui Meta. Refresh halaman lalu pilih template dari daftar.",
    );
  }

  const localTemplate = await prisma.whatsAppTemplate.findFirst({
    where: { businessId, name: template.name, languageCode: template.languageCode },
    select: { headerImageUrl: true },
  });
  return { ...template, headerImageUrl: localTemplate?.headerImageUrl ?? null };
}

export async function submitMetaWhatsAppTemplate(
  businessId: string,
  input: SubmitMetaWhatsAppTemplateInput,
): Promise<SubmitMetaWhatsAppTemplateResult> {
  const credentials = await getWhatsAppCredentialsForBusiness(businessId);

  if (!credentials.wabaId || !credentials.accessToken) {
    throw new Error("Hubungkan WhatsApp Cloud API sebelum mengajukan template ke Meta.");
  }

  const metaBody = normalizeWhatsAppFormatting(input.headerImageUrl && input.title ? `${input.title}\n${input.body}` : input.body);
  if (metaBody.length > 1_024) {
    throw new Error("Judul dan isi template bergambar jika digabung maksimal 1.024 karakter.");
  }
  const bodyVariables = readBodyVariableNumbers(metaBody);
  const components: Array<Record<string, unknown>> = [];

  if (input.headerImageUrl) {
    const appId = readText(process.env.WHATSAPP_APP_ID, 128);
    if (!appId) {
      throw new Error("WHATSAPP_APP_ID belum dikonfigurasi. Tambahkan App ID Meta di Environment Variables Vercel.");
    }

    const headerHandle = await uploadMetaTemplateSample(
      input.headerImageUrl,
      input.name,
      appId,
      credentials.accessToken,
      credentials.appSecret,
    );
    components.push({
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [headerHandle] },
    });
  } else if (input.title) {
    components.push({ type: "HEADER", format: "TEXT", text: input.title });
  }

  components.push({
    type: "BODY",
    text: metaBody,
    ...(bodyVariables.length > 0
      ? { example: { body_text: [bodyVariables.map((number) => `Contoh ${number}`)] } }
      : {}),
  });

  const query = new URLSearchParams();
  const appSecretProof = credentials.appSecret
    ? createHmac("sha256", credentials.appSecret).update(credentials.accessToken).digest("hex")
    : null;
  if (appSecretProof) query.set("appsecret_proof", appSecretProof);

  const response = await fetchWhatsAppGraph(
    whatsAppGraphApiUrl(`${encodeURIComponent(credentials.wabaId)}/message_templates?${query.toString()}`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        name: input.name,
        language: input.languageCode,
        category: input.purpose,
        components,
      }),
    },
  );
  const responseBody = await readWhatsAppGraphResponse(response);

  if (!response.ok) {
    throw new Error(metaSubmissionError(response.status, responseBody));
  }

  return {
    id: isRecord(responseBody) ? readText(responseBody.id, 160) : null,
    status: isRecord(responseBody) ? readText(responseBody.status, 64) : null,
  };
}

async function uploadMetaTemplateSample(
  imageUrl: string,
  templateName: string,
  appId: string,
  accessToken: string,
  appSecret: string | null,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    throw new Error("URL gambar template tidak valid.");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Gambar template harus tersimpan pada URL HTTPS.");
  }

  const imageResponse = await fetchWhatsAppGraph(imageUrl, { cache: "no-store" });
  if (!imageResponse.ok) throw new Error("Gambar template tidak bisa dibaca untuk dikirim ke Meta.");

  const contentType = imageResponse.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/jpeg" && contentType !== "image/png") {
    throw new Error("Meta hanya menerima contoh gambar JPG atau PNG untuk header template.");
  }

  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  if (buffer.length === 0 || buffer.length > maxTemplateSampleBytes) {
    throw new Error("Ukuran contoh gambar template harus antara 1 byte dan 5 MB.");
  }

  const sessionQuery = new URLSearchParams({
    file_length: String(buffer.length),
    file_type: contentType,
    file_name: `${templateName}.${contentType === "image/png" ? "png" : "jpg"}`,
  });
  if (appSecret) {
    sessionQuery.set("appsecret_proof", createHmac("sha256", appSecret).update(accessToken).digest("hex"));
  }

  const sessionResponse = await fetchWhatsAppGraph(
    whatsAppGraphApiUrl(`${encodeURIComponent(appId)}/uploads?${sessionQuery.toString()}`),
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    },
  );
  const sessionBody = await readWhatsAppGraphResponse(sessionResponse);
  const uploadId = isRecord(sessionBody) ? readText(sessionBody.id, 2_000) : null;
  if (!sessionResponse.ok || !uploadId) {
    throw new Error(metaSubmissionError(sessionResponse.status, sessionBody, "Sesi upload gambar Meta gagal dibuat"));
  }

  const uploadResponse = await fetchWhatsAppGraph(whatsAppGraphApiUrl(uploadId), {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      "Content-Type": contentType,
      file_offset: "0",
    },
    body: buffer,
  });
  const uploadBody = await readWhatsAppGraphResponse(uploadResponse);
  const headerHandle = isRecord(uploadBody) ? readText(uploadBody.h, 4_096) : null;
  if (!uploadResponse.ok || !headerHandle) {
    throw new Error(metaSubmissionError(uploadResponse.status, uploadBody, "Upload contoh gambar ke Meta gagal"));
  }

  return headerHandle;
}

function readBodyVariableNumbers(body: string) {
  const numbers = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
    .map((match) => Number(match[1]))
    .filter((number, index, values) => Number.isSafeInteger(number) && number > 0 && values.indexOf(number) === index)
    .sort((left, right) => left - right);
  if (numbers.some((number, index) => number !== index + 1)) {
    throw new Error("Variabel body harus berurutan mulai dari {{1}}.");
  }
  return numbers;
}

function metaSubmissionError(status: number, body: unknown, prefix = "Pengajuan template ke Meta gagal") {
  const providerMessage = isRecord(body) && isRecord(body.error) ? readText(body.error.message, 300) : null;
  if (status === 401) return `${prefix}: token Meta tidak valid atau sudah kedaluwarsa.`;
  if (status === 403) return `${prefix}: token belum memiliki izin WhatsApp Business Management.`;
  return providerMessage ? `${prefix}: ${providerMessage}` : `${prefix}. Coba lagi setelah refresh.`;
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
