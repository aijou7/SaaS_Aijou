import {
  BookOpen,
  CheckCircle2,
  FileText,
  Globe2,
  MessageCircle,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createKnowledgeBaseAction,
  createKnowledgeTemplateAction,
  deleteKnowledgeBaseAction,
  generateStarterKnowledgeAction,
  importTextKnowledgeAction,
  reviewKnowledgeBaseAction,
  syncWebsiteKnowledgeAction,
  updateKnowledgeBaseAction,
} from "@/app/knowledge/actions";
import { AppShell } from "@/components/app-shell";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  knowledgeCategoryMaxChars,
  knowledgeContentMaxChars,
  knowledgeImportMaxBytes,
  knowledgeTitleMaxChars,
} from "@/lib/knowledge-limits";
import { getSession } from "@/lib/session";
import { getKnowledgeBasePage, knowledgeTemplates } from "@/server/knowledge/knowledge-base";

type KnowledgePageProps = {
  searchParams?: Promise<KnowledgeSearchParams>;
};

type KnowledgeSearchParams = {
  page?: string;
  q?: string;
  websiteSync?: string;
  prices?: string;
  imported?: string;
  generated?: string;
  reviewed?: string;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const paramsPromise: Promise<KnowledgeSearchParams> =
    searchParams ?? Promise.resolve({});
  const [session, params] = await Promise.all([getSession(), paramsPromise]);
  if (!session) redirect("/login" as Route);

  const pageNumber = Math.max(1, Number(params.page ?? 1) || 1);
  const query = params.q?.trim() ?? "";
  const page = await getKnowledgeBasePage(session.userId, { page: pageNumber, q: query });
  const syncedPriceCount = Math.max(0, Number(params.prices ?? "0") || 0);

  return (
    <AppShell active="knowledge" businessName={page.business?.businessName}>
      <section className="core-page knowledge-unified-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Otak bisnis Aijou</p>
            <h1>Satu tempat untuk semua pengetahuan Aijou.</h1>
            <p>
              Masukkan layanan, FAQ, aturan harga, kebijakan, dan contoh percakapan.
              Hanya knowledge aktif yang dipakai AI saat menjawab customer.
            </p>
          </div>
          <form action={generateStarterKnowledgeAction}>
            <ConfirmSubmitButton
              className="primary-button icon-link"
              confirmation="Buat beberapa draft knowledge dari profil bisnis? Periksa dan setujui dulu sebelum dipakai AI."
            >
              <Sparkles size={17} aria-hidden="true" />
              Buat knowledge awal
            </ConfirmSubmitButton>
          </form>
        </div>

        {params.websiteSync === "success" ? (
          <p className="chat-live-notice" role="status">
            Website berhasil disinkronkan. {syncedPriceCount} harga mulai terdeteksi dan
            knowledge website sudah diperbarui.
          </p>
        ) : null}
        {params.imported === "draft" || params.generated === "draft" ? (
          <p className="chat-live-notice" role="status">
            Draft berhasil dibuat. Periksa isi dan klik Setujui sebelum Aijou boleh memakainya.
          </p>
        ) : null}
        {params.reviewed ? (
          <p className="chat-live-notice" role="status">
            {params.reviewed === "approved"
              ? "Knowledge disetujui dan sudah aktif untuk Aijou."
              : "Draft ditolak dan tidak akan dipakai Aijou."}
          </p>
        ) : null}

        <div className="knowledge-unified-note" role="note">
          <BookOpen size={20} aria-hidden="true" />
          <div>
            <strong>Tidak ada lagi Knowledge biasa dan lanjutan.</strong>
            <p>
              Semua sumber masuk ke daftar yang sama. Hasil import dan generator selalu menjadi
              draft agar pemilik bisnis dapat memeriksanya sebelum dipakai AI.
            </p>
          </div>
        </div>

        <div className="core-metrics">
          <div className="core-metric">
            <BookOpen size={20} aria-hidden="true" />
            <span>Total knowledge</span>
            <strong>{page.pagination.total}</strong>
          </div>
          <div className="core-metric">
            <Sparkles size={20} aria-hidden="true" />
            <span>Aktif untuk Aijou</span>
            <strong>{page.activeCount}</strong>
          </div>
          <div className="core-metric">
            <MessageCircle size={20} aria-hidden="true" />
            <span>Menunggu review</span>
            <strong>{page.draftCount}</strong>
          </div>
        </div>

        <div className="core-grid">
          <section className="core-card">
            <div className="section-header">
              <div>
                <h2>Tambah manual</h2>
                <p className="muted">Untuk fakta, FAQ, layanan, harga, dan aturan bisnis.</p>
              </div>
              <Plus size={21} aria-hidden="true" />
            </div>
            <form className="form-grid" action={createKnowledgeBaseAction}>
              <label>
                Judul
                <input
                  name="title"
                  type="text"
                  maxLength={knowledgeTitleMaxChars}
                  placeholder="FAQ harga instalasi WiFi"
                  required
                />
              </label>
              <label>
                Kategori
                <input
                  name="category"
                  type="text"
                  maxLength={knowledgeCategoryMaxChars}
                  placeholder="faq / services / pricing"
                />
              </label>
              <label className="span-2">
                Isi knowledge
                <textarea
                  name="content"
                  maxLength={knowledgeContentMaxChars}
                  placeholder="Tulis informasi yang boleh dipakai AI saat menjawab customer."
                  required
                />
              </label>
              <label className="checkbox-label span-2">
                <input name="isActive" type="checkbox" defaultChecked />
                Langsung aktif dan dipakai AI
              </label>
              <button className="primary-button span-2 icon-link" type="submit">
                <Plus size={17} aria-hidden="true" />
                Tambah knowledge
              </button>
            </form>
          </section>

          <section className="core-card">
            <div className="section-header">
              <div>
                <h2>Import file atau chat lama</h2>
                <p className="muted">PDF, DOCX, TXT, MD, CSV, atau paste percakapan.</p>
              </div>
              <FileText size={21} aria-hidden="true" />
            </div>
            <form className="form-grid" action={importTextKnowledgeAction}>
              <label>
                Judul
                <input
                  name="title"
                  type="text"
                  maxLength={knowledgeTitleMaxChars}
                  placeholder="Contoh closing chat bulan Juni"
                />
              </label>
              <label>
                Kategori
                <input
                  name="category"
                  type="text"
                  maxLength={knowledgeCategoryMaxChars}
                  defaultValue="imported-chat"
                />
              </label>
              <label className="span-2">
                Upload file
                <input
                  name="file"
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv"
                />
                <small className="muted">
                  Maksimal {Math.round(knowledgeImportMaxBytes / 1024 / 1024)} MB. Isi file masuk
                  sebagai draft; file asli tidak disimpan.
                </small>
              </label>
              <label className="span-2">
                Atau paste isi
                <textarea
                  name="pastedText"
                  maxLength={knowledgeContentMaxChars}
                  placeholder={"Customer: Harga pasang WiFi berapa?\nAdmin: Boleh info lokasi dan jumlah titik dulu?"}
                />
              </label>
              <button className="ghost-button span-2 icon-link" type="submit">
                <FileText size={17} aria-hidden="true" />
                Import sebagai draft
              </button>
            </form>
          </section>
        </div>

        <section className="core-card">
          <div className="section-header">
            <div>
              <h2>Sinkronkan website resmi</h2>
              <p className="muted">
                Perbarui layanan, FAQ, dan harga “mulai dari” dari homepage publik.
              </p>
            </div>
            <Globe2 size={22} aria-hidden="true" />
          </div>
          <div className="form-grid">
            <label className="span-2">
              Website aktif
              <input
                type="url"
                value={page.business?.websiteUrl ?? ""}
                placeholder="Atur URL di Profil bisnis"
                readOnly
              />
            </label>
            <form className="span-2" action={syncWebsiteKnowledgeAction}>
              <button
                className="primary-button icon-link"
                type="submit"
                disabled={!page.business?.websiteUrl}
              >
                <Globe2 size={17} aria-hidden="true" />
                Sinkronkan website sekarang
              </button>
            </form>
          </div>
        </section>

        <section className="core-card">
          <div className="section-header">
            <div>
              <h2>Template bawaan</h2>
              <p className="muted">
                Pilih kerangka siap edit. Konfirmasi selalu diminta sebelum template ditambahkan.
              </p>
            </div>
          </div>
          <div className="template-grid">
            {knowledgeTemplates.map((template) => (
              <form action={createKnowledgeTemplateAction} key={template.key}>
                <input name="templateKey" type="hidden" value={template.key} />
                <ConfirmSubmitButton
                  className="template-button"
                  confirmation={`Tambahkan template “${template.title}” sebagai knowledge aktif? Kamu bisa mengedit atau menghapusnya setelah dibuat.`}
                >
                  <strong>{template.title}</strong>
                  <small>{template.category}</small>
                </ConfirmSubmitButton>
              </form>
            ))}
          </div>
        </section>

        <section className="core-card knowledge-library">
          <div className="section-header">
            <div>
              <h2>Daftar knowledge</h2>
              <p className="muted">Cari, edit, aktifkan, nonaktifkan, atau hapus entry.</p>
            </div>
            <span className="status">{page.pagination.total} item</span>
          </div>
          <form className="chat-archive-filter" action="/knowledge" method="get">
            <input
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Cari judul, kategori, atau isi"
            />
            <button className="ghost-button" type="submit">Cari</button>
          </form>

          {page.entries.length === 0 ? (
            <div className="empty-state">
              <strong>{query ? "Knowledge tidak ditemukan" : "Belum ada knowledge"}</strong>
              <p>{query ? "Coba kata kunci lain." : "Tambahkan manual, import file, atau pilih template."}</p>
            </div>
          ) : (
            <div className="transaction-list">
              {page.entries.map((entry) => (
                <details className="transaction-item knowledge-entry" key={entry.id}>
                  <summary>
                    <span>
                      <strong>{entry.title}</strong>
                      <small>
                        {entry.category ?? "general"} · {sourceLabel(entry.sourceType)}
                        {entry.sourceName ? ` (${entry.sourceName})` : ""} · Prioritas {entry.priority}
                        {` · Diperbarui ${entry.updatedAt}`}
                      </small>
                    </span>
                    <span
                      className={
                        entry.reviewStatus === "DRAFT"
                          ? "status status-warning"
                          : entry.isActive
                            ? "status"
                            : "status status-warning"
                      }
                    >
                      {entry.reviewStatus === "DRAFT"
                        ? "Perlu review"
                        : entry.reviewStatus === "REJECTED"
                          ? "Ditolak"
                          : entry.isActive
                            ? "Aktif"
                            : "Nonaktif"}
                    </span>
                  </summary>
                  <form className="form-grid edit-form" action={updateKnowledgeBaseAction}>
                    <input name="entryId" type="hidden" value={entry.id} />
                    <label>
                      Judul
                      <input
                        name="title"
                        type="text"
                        maxLength={knowledgeTitleMaxChars}
                        defaultValue={entry.title}
                        required
                      />
                    </label>
                    <label>
                      Kategori
                      <input
                        name="category"
                        type="text"
                        maxLength={knowledgeCategoryMaxChars}
                        defaultValue={entry.category ?? ""}
                      />
                    </label>
                    <label className="span-2">
                      Isi knowledge
                      <textarea
                        name="content"
                        maxLength={knowledgeContentMaxChars}
                        defaultValue={entry.content}
                        required
                      />
                    </label>
                    {entry.reviewStatus === "APPROVED" ? (
                      <label className="checkbox-label span-2">
                        <input name="isActive" type="checkbox" defaultChecked={entry.isActive} />
                        Aktif dan dipakai AI
                      </label>
                    ) : (
                      <p className="muted span-2">
                        Draft belum dipakai AI. Koreksi bila perlu, simpan, lalu setujui.
                      </p>
                    )}
                    <div className="form-actions span-2">
                      <button className="primary-button" type="submit">Simpan perubahan</button>
                    </div>
                  </form>
                  {entry.reviewStatus === "DRAFT" ? (
                    <div className="form-actions">
                      <form action={reviewKnowledgeBaseAction}>
                        <input name="entryId" type="hidden" value={entry.id} />
                        <input name="decision" type="hidden" value="approve" />
                        <ConfirmSubmitButton
                          className="primary-button icon-link"
                          confirmation={`Setujui “${entry.title}”? Setelah disetujui, Aijou dapat memakai isinya.`}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" />
                          Setujui & aktifkan
                        </ConfirmSubmitButton>
                      </form>
                      <form action={reviewKnowledgeBaseAction}>
                        <input name="entryId" type="hidden" value={entry.id} />
                        <input name="decision" type="hidden" value="reject" />
                        <ConfirmSubmitButton
                          className="ghost-button icon-link"
                          confirmation={`Tolak draft “${entry.title}”? Draft tetap tersimpan tetapi tidak dipakai AI.`}
                        >
                          <XCircle size={16} aria-hidden="true" />
                          Tolak draft
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : null}
                  <form className="knowledge-delete-form" action={deleteKnowledgeBaseAction}>
                    <input name="entryId" type="hidden" value={entry.id} />
                    <ConfirmSubmitButton
                      className="danger-button icon-link"
                      confirmation={`Hapus permanen “${entry.title}”? Tindakan ini tidak bisa dibatalkan dan AI tidak akan memakai entry ini lagi.`}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Hapus permanen
                    </ConfirmSubmitButton>
                  </form>
                </details>
              ))}
            </div>
          )}

          {page.pagination.pageCount > 1 ? (
            <div className="orders-pagination">
              <span>Halaman {page.pagination.page} dari {page.pagination.pageCount}</span>
              <div className="orders-header-actions">
                {page.pagination.page > 1 ? (
                  <Link className="ghost-button" href={knowledgePageUrl(query, page.pagination.page - 1)}>
                    Sebelumnya
                  </Link>
                ) : null}
                {page.pagination.page < page.pagination.pageCount ? (
                  <Link className="ghost-button" href={knowledgePageUrl(query, page.pagination.page + 1)}>
                    Berikutnya
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </AppShell>
  );
}

function knowledgePageUrl(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  return `/knowledge?${params.toString()}`;
}

function sourceLabel(sourceType: string) {
  return {
    MANUAL: "Manual",
    ONBOARDING: "Onboarding",
    WEBSITE: "Website",
    FILE: "File",
    CONVERSATION: "Percakapan",
  }[sourceType] ?? sourceType;
}
