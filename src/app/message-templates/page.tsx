import { CheckCircle2, Clock3, FileText, ImagePlus, Search, XCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createMessageTemplateAction,
  submitMessageTemplateAction,
  updateMessageTemplateAction,
} from "@/app/message-templates/actions";
import { AppShell } from "@/components/app-shell";
import { FormSubmitButton } from "@/components/form-submit-button";
import { MessageTemplateBuilder } from "@/components/message-template-builder";
import { getSession } from "@/lib/session";
import { getMessageTemplatesPage } from "@/server/message-templates/message-templates";

type MessageTemplatesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MessageTemplatesPage({ searchParams }: MessageTemplatesPageProps) {
  const session = await getSession();

  if (!session) redirect("/login" as Route);

  const params = searchParams ? await searchParams : {};
  const q = singleParam(params.q)?.trim().slice(0, 120) ?? "";
  const created = singleParam(params.created) === "1";
  const submitted = singleParam(params.submitted) === "1";
  const updated = singleParam(params.updated) === "1";
  const editId = singleParam(params.edit)?.trim() ?? "";
  const page = await getMessageTemplatesPage(session.userId, { q });
  const editTemplate = editId
    ? page.templates.find((template) => template.source === "LOCAL" && template.status === "DRAFT" && template.id === editId)
    : undefined;

  return (
    <AppShell active="message-templates" businessName={page.businessName} workspaceRole={session.role ?? "VIEWER"}>
      <section className="content-panel message-templates-page">
        <div className="content-toolbar">
          <div>
            <p className="eyebrow">WhatsApp Cloud API</p>
            <h1>Template WhatsApp</h1>
            <p className="muted">Template approved dari Meta otomatis muncul di sini. Draft baru bisa disiapkan dengan gambar header sebelum diajukan ke Meta.</p>
          </div>
          <form className="content-actions" action="/message-templates" method="get">
            <label className="toolbar-search">
              <input name="q" type="search" defaultValue={q} placeholder="Cari template" maxLength={120} aria-label="Cari template WhatsApp" />
              <Search size={16} aria-hidden="true" />
            </label>
            <button className="ghost-button" type="submit">Cari</button>
            {q ? <Link className="ghost-button" href="/message-templates">Reset</Link> : null}
          </form>
        </div>

        {created ? <div className="success-banner" role="status">Template berhasil disimpan sebagai draft.</div> : null}
        {submitted ? <div className="success-banner" role="status">Template berhasil diajukan ke Meta dan sedang menunggu review.</div> : null}
        {updated ? <div className="success-banner" role="status">Perubahan draft berhasil disimpan.</div> : null}
        {editId && !editTemplate ? <div className="settings-note" role="alert">Draft tidak ditemukan atau sudah tidak bisa diedit.</div> : null}
        {page.metaSyncError ? <div className="settings-note" role="alert">{page.metaSyncError}</div> : null}
        {page.metaSyncTruncated ? <div className="settings-note" role="status">Meta mengembalikan lebih dari 300 template; daftar menampilkan 300 pertama.</div> : null}

        <section className="grid message-template-metrics" aria-label="Ringkasan template WhatsApp">
          <TemplateMetric icon={FileText} label="Total" value={page.summary.total} />
          <TemplateMetric icon={CheckCircle2} label="Disetujui" value={page.summary.approved} />
          <TemplateMetric icon={Clock3} label="Direview" value={page.summary.inReview} />
          <TemplateMetric icon={XCircle} label="Ditolak" value={page.summary.rejected} />
        </section>

        <MessageTemplateBuilder
          key={editTemplate?.id ?? "new-template"}
          action={editTemplate ? updateMessageTemplateAction : createMessageTemplateAction}
          initialTemplate={editTemplate}
          imageUploadReady={page.imageUploadReady}
        />

        <section className="section">
          <div className="card">
            <div className="section-header">
              <div>
                <h2>Template tersimpan</h2>
                <p className="muted">{page.templates.length} {q ? "hasil pencarian" : "template tersedia"}.</p>
              </div>
            </div>
            {page.templates.length === 0 ? (
              <div className="empty-state">
                <strong>{q ? "Template tidak ditemukan" : "Belum ada template"}</strong>
                <p>{q ? "Coba kata kunci lain atau reset pencarian." : "Buat draft pertama dengan atau tanpa gambar header."}</p>
              </div>
            ) : (
              <div className="message-template-list">
                {page.templates.map((template) => (
                  <article className="message-template-row" key={template.id}>
                    {template.headerImageUrl ? <img src={template.headerImageUrl} alt="" loading="lazy" /> : <div className="message-template-row-placeholder"><ImagePlus size={18} aria-hidden="true" /></div>}
                    <div className="message-template-row-main">
                      <div className="message-template-row-heading">
                        <div>
                          <strong>{template.name}</strong>
                          <span>{formatPurpose(template.purpose)} · {template.languageCode} · {template.source === "META" ? "disinkronkan dari Meta" : `diperbarui ${template.updatedAt}`}</span>
                        </div>
                        <span className={statusClass(template.status)}>{formatStatus(template.status)}</span>
                      </div>
                      {template.title ? <h3>{template.title}</h3> : null}
                      <p>{template.body}</p>
                      {template.rejectionReason ? <small className="template-rejection">Alasan ditolak: {template.rejectionReason}</small> : null}
                      {template.source === "LOCAL" && template.status === "DRAFT" ? (
                        <div className="message-template-row-actions">
                          <Link className="ghost-button" href={`/message-templates?edit=${encodeURIComponent(template.id)}`}>Edit draft</Link>
                          <form action={submitMessageTemplateAction}>
                            <input type="hidden" name="templateId" value={template.id} />
                            <FormSubmitButton className="primary-button" label="Ajukan ke Meta" pendingLabel="Mengajukan…" />
                          </form>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function TemplateMetric({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: number }) {
  return <div className="card template-metric"><Icon size={20} aria-hidden="true" /><span>{label}</span><strong>{value}</strong></div>;
}

function formatPurpose(value: string) {
  return value === "MARKETING" ? "Marketing" : value === "AUTHENTICATION" ? "Authentication" : "Utility";
}

function formatStatus(value: string) {
  return value === "IN_REVIEW" ? "Direview" : value === "APPROVED" ? "Disetujui" : value === "REJECTED" ? "Ditolak" : "Draft";
}

function statusClass(value: string) {
  return value === "APPROVED" ? "status" : value === "REJECTED" ? "status status-warning" : "status status-neutral";
}

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
