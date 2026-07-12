import { Archive, Edit, MessageCircle, Plus, Search, Zap } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createQuickReplyAction,
  deleteQuickReplyAction,
  updateQuickReplyAction,
} from "@/app/quick-replies/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getQuickRepliesPage } from "@/server/quick-replies/quick-replies";

type QuickRepliesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function QuickRepliesPage({ searchParams }: QuickRepliesPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const params = searchParams ? await searchParams : {};
  const q = getSingleParam(params.q)?.trim().slice(0, 120) ?? "";
  const page = await getQuickRepliesPage(session.userId, { q });

  return (
    <AppShell active="quick-replies" businessName={page.business?.businessName ?? "Quick Replies"}>
      <section className="content-panel">
        <div className="content-toolbar">
          <div>
            <p className="eyebrow">Human takeover tools</p>
            <h1>Quick Replies</h1>
            <p className="muted">
              Template balasan owner supaya follow-up chat website lebih cepat dan konsisten.
            </p>
          </div>
          <form className="content-actions" action="/quick-replies" method="get">
            <label className="toolbar-search">
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Search Quick Replies"
                maxLength={120}
                aria-label="Search quick replies"
              />
              <Search size={16} aria-hidden="true" />
            </label>
            <button className="ghost-button" type="submit">Cari</button>
            {q ? <Link className="ghost-button" href="/quick-replies">Reset</Link> : null}
          </form>
        </div>

        <section className="grid" aria-label="Quick reply summary">
          <div className="card">
            <MessageCircle size={22} aria-hidden="true" />
            <h2>Total</h2>
            <div className="metric">{page.summary.total}</div>
            <p className="muted">Template tersimpan.</p>
          </div>
          <div className="card">
            <Zap size={22} aria-hidden="true" />
            <h2>Active</h2>
            <div className="metric">{page.summary.active}</div>
            <p className="muted">Muncul di chat detail.</p>
          </div>
          <div className="card">
            <MessageCircle size={22} aria-hidden="true" />
            <h2>Private</h2>
            <div className="metric">{page.summary.private}</div>
            <p className="muted">Ditandai private untuk tim.</p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <div>
                <h2>Add quick reply</h2>
                <p className="muted">Bikin template singkat yang bisa dikirim dari conversation.</p>
              </div>
            </div>
            <form className="form-grid" action={createQuickReplyAction}>
              <QuickReplyFields />
              <button className="primary-button span-2" type="submit">
                <Plus size={15} aria-hidden="true" />
                Add Quick Reply
              </button>
            </form>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <div>
                <h2>Templates</h2>
                <p className="muted">
                  {page.quickReplies.length} {q ? "hasil pencarian" : "quick replies tersedia"}.
                </p>
              </div>
            </div>

            {page.quickReplies.length === 0 ? (
              <div className="empty-state">
                <strong>{q ? "Quick reply tidak ditemukan" : "Belum ada quick reply"}</strong>
                <p>
                  {q
                    ? "Coba kata kunci lain atau reset pencarian."
                    : "Tambahkan template pertama supaya owner bisa balas cepat dari inbox."}
                </p>
              </div>
            ) : (
              <div className="transaction-list">
                {page.quickReplies.map((reply) => (
                  <details className="transaction-item" key={reply.id}>
                    <summary>
                      <span>
                        <strong>{reply.name}</strong>
                        <small>
                          {reply.shortcut ?? "No shortcut"} · {reply.category ?? "General"} ·{" "}
                          {reply.isActive ? "Active" : "Inactive"} · Updated {reply.updatedAt}
                        </small>
                        <span className="muted conversation-preview">{reply.content}</span>
                      </span>
                      <span className={reply.isActive ? "status" : "status status-warning"}>
                        {reply.isActive ? "Active" : "Inactive"}
                      </span>
                    </summary>

                    <div className="lead-grid">
                      <div>
                        <h3>Preview</h3>
                        <p>{reply.content}</p>
                        <p className="muted">Created: {reply.createdAt}</p>
                        <p className="muted">Sort order: {reply.sortOrder}</p>
                        <p className="muted">Private: {reply.isPrivate ? "Yes" : "No"}</p>
                      </div>
                      <form className="form-grid" action={updateQuickReplyAction}>
                        <input name="quickReplyId" type="hidden" value={reply.id} />
                        <QuickReplyFields reply={reply} />
                        <button className="primary-button span-2" type="submit">
                          <Edit size={15} aria-hidden="true" />
                          Update Quick Reply
                        </button>
                      </form>
                    </div>

                    <form className="quick-actions" action={deleteQuickReplyAction}>
                      <input name="quickReplyId" type="hidden" value={reply.id} />
                      <button className="small-danger-button" type="submit">
                        <Archive size={13} aria-hidden="true" />
                        Nonaktifkan
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>
    </AppShell>
  );
}

function QuickReplyFields({
  reply,
}: {
  reply?: {
    name: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    isPrivate: boolean;
    isActive: boolean;
    sortOrder: number;
  };
}) {
  return (
    <>
      <label>
        Name
        <input name="name" type="text" defaultValue={reply?.name ?? ""} placeholder="Minta lokasi" maxLength={80} required />
      </label>
      <label>
        Shortcut
        <input name="shortcut" type="text" defaultValue={reply?.shortcut ?? ""} placeholder="/lokasi" maxLength={80} />
      </label>
      <label>
        Category
        <input name="category" type="text" defaultValue={reply?.category ?? ""} placeholder="Discovery" maxLength={80} />
      </label>
      <label>
        Sort order
        <input name="sortOrder" type="number" defaultValue={reply?.sortOrder ?? 100} />
      </label>
      <label className="span-2">
        Content
        <textarea
          name="content"
          defaultValue={reply?.content ?? ""}
          placeholder="Siap, boleh share lokasi project dan area yang perlu dicover?"
          maxLength={1000}
          required
        />
      </label>
      <label className="checkbox-label">
        <input name="isActive" type="checkbox" defaultChecked={reply?.isActive ?? true} />
        Active
      </label>
      <label className="checkbox-label">
        <input name="isPrivate" type="checkbox" defaultChecked={reply?.isPrivate ?? false} />
        Private quick reply
      </label>
    </>
  );
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
