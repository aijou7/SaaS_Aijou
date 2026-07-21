import { Bug, CheckCircle2, Lightbulb, LifeBuoy, MessageSquareText } from "lucide-react";
import { redirect } from "next/navigation";
import { submitFeedbackAction } from "@/app/feedback/actions";
import { AppShell } from "@/components/app-shell";
import { FeedbackCategory } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { feedbackCategoryLabels, getFeedbackPage } from "@/server/feedback";

type FeedbackPageProps = {
  searchParams: Promise<{ saved?: string; error?: string; from?: string }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [page, params] = await Promise.all([getFeedbackPage(session.userId), searchParams]);

  return (
    <AppShell active="feedback" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Feedback beta</p>
        <h1>Ceritakan yang rusak, membingungkan, atau masih kurang.</h1>
        <p>Setiap laporan masuk dengan konteks workspace dan bisa ditindaklanjuti langsung.</p>
      </section>

      {params.saved === "1" ? (
        <div className="settings-note" role="status"><strong>Feedback terkirim.</strong> Makasih—laporannya sudah masuk ke cockpit beta.</div>
      ) : null}
      {params.error ? (
        <div className="settings-note" role="alert"><strong>Belum tersimpan.</strong> {params.error}</div>
      ) : null}

      <section className="section split-layout">
        <div className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Kirim laporan</p><h2>Apa yang kamu alami?</h2></div>
            <MessageSquareText size={24} aria-hidden="true" />
          </div>
          <form className="form-grid" action={submitFeedbackAction}>
            <input name="pageUrl" type="hidden" value={params.from ?? "/feedback"} />
            <label>
              Kategori
              <select name="category" defaultValue={FeedbackCategory.BUG}>
                {Object.values(FeedbackCategory).map((category) => (
                  <option value={category} key={category}>{feedbackCategoryLabels[category]}</option>
                ))}
              </select>
            </label>
            <label>
              Rating pengalaman
              <select name="rating" defaultValue="">
                <option value="">Opsional</option>
                <option value="5">5 — Mantap</option>
                <option value="4">4 — Bagus</option>
                <option value="3">3 — Cukup</option>
                <option value="2">2 — Mengganggu</option>
                <option value="1">1 — Terblokir</option>
              </select>
            </label>
            <label className="span-2">
              Judul
              <input name="title" maxLength={120} minLength={3} required placeholder="Contoh: Pesan baru tidak muncul" />
            </label>
            <label className="span-2">
              Detail
              <textarea name="message" maxLength={4000} minLength={10} required rows={7} placeholder="Apa yang kamu lakukan, hasil yang muncul, dan hasil yang kamu harapkan?" />
            </label>
            <button className="primary-button span-2" type="submit">Kirim feedback</button>
          </form>
        </div>

        <div className="card">
          <div className="section-title-row">
            <div><p className="eyebrow">Riwayat kamu</p><h2>{page.feedback.length} laporan</h2></div>
            <LifeBuoy size={24} aria-hidden="true" />
          </div>
          <div className="stack-list">
            {page.feedback.length ? page.feedback.map((item) => (
              <article className="settings-note" key={item.id}>
                <div className="section-title-row">
                  <strong>{item.title}</strong>
                  <span className={item.status === "RESOLVED" || item.status === "CLOSED" ? "status" : "status status-warning"}>{item.status.replaceAll("_", " ")}</span>
                </div>
                <p>{item.message}</p>
                <small>{feedbackCategoryLabels[item.category]} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(item.createdAt)}</small>
                {item.adminResponse ? <p><strong>Balasan Aijou:</strong> {item.adminResponse}</p> : null}
              </article>
            )) : (
              <div className="empty-state"><CheckCircle2 size={24} /><strong>Belum ada laporan</strong><p>Semoga karena semuanya lancar. Kalau ada yang aneh, kirim dari form ini.</p></div>
            )}
          </div>
          <div className="quick-actions" aria-label="Jenis feedback">
            <span className="meta-pill"><Bug size={14} /> Bug</span>
            <span className="meta-pill"><Lightbulb size={14} /> Ide</span>
            <span className="meta-pill"><LifeBuoy size={14} /> Support</span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
