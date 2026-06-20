import { BookOpen, Plus } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  createKnowledgeBaseAction,
  createKnowledgeTemplateAction,
  deleteKnowledgeBaseAction,
  generateStarterKnowledgeAction,
  updateKnowledgeBaseAction,
} from "@/app/knowledge/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getKnowledgeBasePage, knowledgeTemplates } from "@/server/knowledge/knowledge-base";

export default async function KnowledgePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getKnowledgeBasePage(session.userId);

  return (
    <AppShell active="knowledge" businessName={page.business?.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">AI business brain</p>
          <h1>Atur pengetahuan yang boleh dipakai AI agent.</h1>
          <p>
            Tambahkan layanan, FAQ, profil perusahaan, batasan harga, dan aturan handoff.
            Groq akan memakai konten aktif ini sebagai sumber jawaban bisnis.
          </p>
        </section>

        <section className="grid" aria-label="Knowledge summary">
          <div className="card">
            <BookOpen size={22} aria-hidden="true" />
            <h2>Total Entries</h2>
            <div className="metric">{page.entries.length}</div>
            <p className="muted">Semua knowledge item.</p>
          </div>
          <div className="card">
            <BookOpen size={22} aria-hidden="true" />
            <h2>Active</h2>
            <div className="metric">{page.activeCount}</div>
            <p className="muted">Dipakai AI agent.</p>
          </div>
          <div className="card">
            <h2>Business</h2>
            <div className="metric">{page.business?.businessName ?? "-"}</div>
            <p className="muted">Context untuk assistant.</p>
          </div>
        </section>

        <section className="section split-layout">
          <div className="card">
            <h2>Tambah Knowledge</h2>
            <form className="form-grid" action={createKnowledgeBaseAction}>
              <label>
                Title
                <input name="title" type="text" placeholder="Layanan instalasi jaringan" required />
              </label>
              <label>
                Category
                <input name="category" type="text" placeholder="services / faq / pricing" />
              </label>
              <label className="span-2">
                Content
                <textarea
                  name="content"
                  placeholder="Jelaskan layanan, batasan, informasi harga estimasi, atau FAQ..."
                  required
                />
              </label>
              <label className="checkbox-label span-2">
                <input name="isActive" type="checkbox" defaultChecked />
                Active
              </label>
              <button className="primary-button span-2 icon-link" type="submit">
                <Plus size={18} aria-hidden="true" />
                Tambah knowledge
              </button>
            </form>
          </div>

          <div className="card">
            <div className="section-header">
              <div>
                <h2>Templates & AI Draft</h2>
                <p className="muted">Pakai template atau generate starter KB dari business profile.</p>
              </div>
            </div>
            <form action={generateStarterKnowledgeAction}>
              <button className="primary-button" type="submit">
                Generate starter knowledge
              </button>
            </form>
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
            <h2>Tips Isi KB</h2>
            <p className="muted">
              Tulis hal-hal yang boleh dijawab AI. Untuk harga, pakai range atau catatan
              estimasi awal, bukan final quote. Tambahkan aturan kapan harus handoff ke owner.
            </p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <h2>Knowledge Entries</h2>
              <span className="muted">{page.entries.length} items</span>
            </div>
            {page.entries.length === 0 ? (
              <p className="muted">Belum ada knowledge. Tambahkan layanan atau FAQ dulu.</p>
            ) : (
              <div className="transaction-list">
                {page.entries.map((entry) => (
                  <details className="transaction-item" key={entry.id}>
                    <summary>
                      <span>
                        <strong>{entry.title}</strong>
                        <small>
                          {entry.category ?? "general"} · Updated {entry.updatedAt}
                        </small>
                      </span>
                      <span className={entry.isActive ? "status" : "status status-warning"}>
                        {entry.isActive ? "Active" : "Inactive"}
                      </span>
                    </summary>
                    <form className="form-grid edit-form" action={updateKnowledgeBaseAction}>
                      <input name="entryId" type="hidden" value={entry.id} />
                      <label>
                        Title
                        <input name="title" type="text" defaultValue={entry.title} required />
                      </label>
                      <label>
                        Category
                        <input name="category" type="text" defaultValue={entry.category ?? ""} />
                      </label>
                      <label className="span-2">
                        Content
                        <textarea name="content" defaultValue={entry.content} required />
                      </label>
                      <label className="checkbox-label span-2">
                        <input name="isActive" type="checkbox" defaultChecked={entry.isActive} />
                        Active
                      </label>
                      <div className="form-actions span-2">
                        <button className="primary-button" type="submit">
                          Simpan
                        </button>
                      </div>
                    </form>
                    <form action={deleteKnowledgeBaseAction}>
                      <input name="entryId" type="hidden" value={entry.id} />
                      <button className="danger-button" type="submit">
                        Delete
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
    </AppShell>
  );
}
