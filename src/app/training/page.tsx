import { BookOpen, FileText, MessageCircle, Plus, Sparkles } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  createKnowledgeBaseAction,
  createKnowledgeTemplateAction,
  generateStarterKnowledgeAction,
  importTextKnowledgeAction,
} from "@/app/knowledge/actions";
import { AppShell } from "@/components/app-shell";
import {
  knowledgeCategoryMaxChars,
  knowledgeContentMaxChars,
  knowledgeImportMaxBytes,
  knowledgeTitleMaxChars,
} from "@/lib/knowledge-limits";
import { getSession } from "@/lib/session";
import { getKnowledgeBasePage, knowledgeTemplates } from "@/server/knowledge/knowledge-base";

export default async function TrainingPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getKnowledgeBasePage(session.userId);

  return (
    <AppShell active="training" businessName={page.business?.businessName}>
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Otak bisnis Aijou</p>
            <h1>Beri Aijou konteks agar setiap jawaban terasa tepat.</h1>
            <p>
              Masukkan FAQ, product knowledge, script closing, aturan harga, dan percakapan
              WhatsApp lama. Semua entry aktif dipakai Aijou sebagai konteks jawaban.
            </p>
          </div>
          <form action={generateStarterKnowledgeAction}>
            <button className="primary-button icon-link" type="submit">
              <Sparkles size={17} aria-hidden="true" />
              Buat knowledge awal
            </button>
          </form>
        </div>

        <div className="core-metrics">
          <div className="core-metric">
            <BookOpen size={20} aria-hidden="true" />
            <span>Total Knowledge</span>
            <strong>{page.entries.length}</strong>
          </div>
          <div className="core-metric">
            <Sparkles size={20} aria-hidden="true" />
            <span>Aktif untuk Aijou</span>
            <strong>{page.activeCount}</strong>
          </div>
          <div className="core-metric">
            <MessageCircle size={20} aria-hidden="true" />
            <span>Sumber pembelajaran</span>
            <strong>Manual + TXT</strong>
          </div>
        </div>

        <div className="core-grid">
          <section className="core-card">
            <h2>Tambah knowledge manual</h2>
            <form className="form-grid" action={createKnowledgeBaseAction}>
              <label>
                Title
                <input
                  name="title"
                  type="text"
                  maxLength={knowledgeTitleMaxChars}
                  placeholder="FAQ harga instalasi WiFi"
                  required
                />
              </label>
              <label>
                Category
                <input
                  name="category"
                  type="text"
                  maxLength={knowledgeCategoryMaxChars}
                  placeholder="faq / product / closing / policy"
                />
              </label>
              <label className="span-2">
                Content
                <textarea
                  name="content"
                  maxLength={knowledgeContentMaxChars}
                  placeholder="Tulis jawaban yang boleh dipakai AI. Misal: harga mulai dari..., minta lokasi..., cara closing..."
                  required
                />
              </label>
              <label className="checkbox-label span-2">
                <input name="isActive" type="checkbox" defaultChecked />
                Aktif dipakai AI
              </label>
              <button className="primary-button span-2 icon-link" type="submit">
                <Plus size={17} aria-hidden="true" />
                Tambah training data
              </button>
            </form>
          </section>

          <section className="core-card">
            <h2>Import .txt / chat WhatsApp lama</h2>
            <form className="form-grid" action={importTextKnowledgeAction}>
              <label>
                Title
                <input
                  name="title"
                  type="text"
                  maxLength={knowledgeTitleMaxChars}
                  placeholder="Contoh closing chat bulan Juni"
                />
              </label>
              <label>
                Category
                <input
                  name="category"
                  type="text"
                  maxLength={knowledgeCategoryMaxChars}
                  defaultValue="imported-chat"
                />
              </label>
              <label className="span-2">
                Upload .txt
                <input
                  name="file"
                  type="file"
                  accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
                />
                <small className="muted">
                  Maksimal {Math.round(knowledgeImportMaxBytes / 1024)} KB per file.
                </small>
              </label>
              <label className="span-2">
                Atau paste percakapan
                <textarea
                  name="pastedText"
                  maxLength={knowledgeContentMaxChars}
                  placeholder="Customer: Kak harga pasang WiFi berapa?\nAdmin: Boleh info lokasi dan jumlah titik dulu ya..."
                />
              </label>
              <button className="ghost-button span-2 icon-link" type="submit">
                <FileText size={17} aria-hidden="true" />
                Import as knowledge
              </button>
            </form>
          </section>
        </div>

        <section className="core-card">
          <div className="section-header">
            <div>
              <h2>Training templates</h2>
              <p className="muted">Tambahkan kerangka penting buat AI sales agent.</p>
            </div>
          </div>
          <div className="template-grid">
            {knowledgeTemplates.map((template) => (
              <form action={createKnowledgeTemplateAction} key={template.key}>
                <input name="templateKey" type="hidden" value={template.key} />
                <button className="template-button" type="submit">
                  <strong>{template.title}</strong>
                  <small>{template.category}</small>
                </button>
              </form>
            ))}
          </div>
        </section>

        <section className="core-card">
          <div className="section-header">
            <div>
              <h2>Knowledge aktif</h2>
              <p className="muted">Yang dipakai AI saat menjawab chat.</p>
            </div>
            <span className="status">{page.activeCount} active</span>
          </div>
          <div className="knowledge-list">
            {page.entries.length === 0 ? (
              <div className="empty-state">
                <strong>Belum ada training data</strong>
                <p>Tambahkan knowledge manual atau import chat lama dulu.</p>
              </div>
            ) : (
              page.entries.slice(0, 8).map((entry) => (
                <article className="knowledge-row" key={entry.id}>
                  <div>
                    <strong>{entry.title}</strong>
                    <small>
                      {entry.category ?? "general"} · Updated {entry.updatedAt}
                    </small>
                  </div>
                  <span className={entry.isActive ? "status" : "status status-warning"}>
                    {entry.isActive ? "Active" : "Inactive"}
                  </span>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
