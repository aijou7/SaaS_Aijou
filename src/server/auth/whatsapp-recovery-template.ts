import { WhatsAppTemplatePurpose, WhatsAppTemplateStatus } from "@/generated/prisma-beta/client";
import { getWhatsAppCredentialsForBusiness } from "@/server/whatsapp/settings";
import { listMetaWhatsAppTemplates } from "@/server/whatsapp/templates";
import { fetchWhatsAppGraph, readWhatsAppGraphResponse, whatsAppGraphApiUrl } from "@/server/whatsapp/graph-api";

export const recoveryTemplateName = "aijou_account_recovery_code";
export const recoveryTemplateLanguage = "id";

export async function getApprovedRecoveryTemplate(businessId: string) {
  const result = await listMetaWhatsAppTemplates(businessId);
  if (result.error || result.truncated) return null;
  return result.templates.find((template) =>
    template.name === recoveryTemplateName &&
    template.languageCode === recoveryTemplateLanguage &&
    template.purpose === WhatsAppTemplatePurpose.AUTHENTICATION &&
    template.status === WhatsAppTemplateStatus.APPROVED,
  ) ?? null;
}

export async function getRecoveryTemplateState(businessId: string) {
  const result = await listMetaWhatsAppTemplates(businessId);
  return {
    error: result.error ?? (result.truncated ? "Daftar template Meta terlalu banyak untuk memastikan status template recovery." : null),
    status: result.templates.find((template) =>
      template.name === recoveryTemplateName &&
      template.languageCode === recoveryTemplateLanguage &&
      template.purpose === WhatsAppTemplatePurpose.AUTHENTICATION,
    )?.status ?? null,
  };
}

export async function submitRecoveryTemplate(businessId: string) {
  const existing = await getRecoveryTemplateState(businessId);
  if (existing.error) throw new Error(existing.error);
  if (existing.status === WhatsAppTemplateStatus.REJECTED) {
    throw new Error("Template recovery ditolak Meta. Periksa alasan penolakan di WhatsApp Manager.");
  }
  if (existing.status) return;

  const credentials = await getWhatsAppCredentialsForBusiness(businessId);
  if (!credentials.wabaId || !credentials.accessToken) {
    throw new Error("Hubungkan WhatsApp Cloud API terlebih dahulu.");
  }

  const response = await fetchWhatsAppGraph(
    whatsAppGraphApiUrl(`${encodeURIComponent(credentials.wabaId)}/message_templates`),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: recoveryTemplateName,
        language: recoveryTemplateLanguage,
        category: "AUTHENTICATION",
        components: [
          { type: "BODY", add_security_recommendation: true },
          { type: "FOOTER", code_expiration_minutes: 10 },
          { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Salin kode" }] },
        ],
      }),
    },
  );
  const body = await readWhatsAppGraphResponse(response);
  if (!response.ok) {
    const code = body && typeof body === "object" && "error" in body &&
      body.error && typeof body.error === "object" && "code" in body.error &&
      (typeof body.error.code === "number" || typeof body.error.code === "string")
      ? String(body.error.code).slice(0, 40) : null;
    console.error("whatsapp_recovery_template_submission_failed", { businessId, status: response.status, code });
    if (response.status === 403) throw new Error("Token Meta belum punya izin mengelola template WhatsApp.");
    throw new Error("Template recovery belum berhasil diajukan ke Meta. Periksa WhatsApp Manager lalu coba lagi.");
  }
}
