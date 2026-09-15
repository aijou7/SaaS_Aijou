import { CheckCircle2, Clock3, FileText, ImagePlus, Search, XCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createMessageTemplateAction } from "@/app/message-templates/actions";
import { AppShell } from "@/components/app-shell";
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
  const page = await getMessageTemplatesPage(session.userId, { q });

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
        {page.metaSyncError ? <div className="settings-note" role="alert">{page.metaSyncError}</div> : null}
        {page.metaSyncTruncated ? <div className="settings-note" role="status">Meta mengembalikan lebih dari 300 template; daftar menampilkan 300 pertama.</div> : null}

        <section className="grid message-template-metrics" aria-label="Ringkasan template WhatsApp">
          <TemplateMetric icon={FileText} label="Total" value={page.summary.total} />
          <TemplateMetric icon={CheckCircle2} label="Disetujui" value={page.summary.approved} />
          <TemplateMetric icon={Clock3} label="Direview" value={page.summary.inReview} />
          <TemplateMetric icon={XCircle} label="Ditolak" value={page.summary.rejected} />
        </section>

        <MessageTemplateBuilder action={createMessageTemplateAction} imageUploadReady={page.imageUploadReady} />

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
