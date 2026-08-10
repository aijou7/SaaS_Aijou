import { Activity, AlertTriangle, GitPullRequestArrow } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatAiConfidence, getAiActivityCopy } from "@/lib/ai-activity-labels";
import { getSession } from "@/lib/session";
import { getAiActivityPage } from "@/server/observability/ai-activity";

export default async function AiActivityPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getAiActivityPage(session.userId);

  return (
    <AppShell active="ai-activity" businessName={page.business?.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">Aktivitas AI</p>
          <h1>Pahami apa yang Aijou lakukan di setiap percakapan.</h1>
          <p>
            Lihat balasan yang dibuat, informasi yang dirangkum, dan percakapan yang diteruskan
            kepada tim.
          </p>
        </section>

        <section className="grid" aria-label="AI activity summary">
          <div className="card">
            <Activity size={22} aria-hidden="true" />
            <h2>Total aktivitas</h2>
            <div className="metric">{page.summary.totalLogs}</div>
            <p className="muted">Semua pekerjaan yang sudah dicatat Aijou.</p>
          </div>
          <div className="card">
            <AlertTriangle size={22} aria-hidden="true" />
            <h2>Perlu ditinjau</h2>
            <div className="metric">{page.summary.lowConfidence}</div>
            <p className="muted">Aktivitas dengan tingkat keyakinan di bawah 70%.</p>
          </div>
          <div className="card">
            <GitPullRequestArrow size={22} aria-hidden="true" />
            <h2>Diteruskan ke tim</h2>
            <div className="metric">{page.summary.handoffRelated}</div>
            <p className="muted">Percakapan yang membutuhkan bantuan manusia.</p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <h2>Aktivitas terbaru</h2>
              <span className="muted">{page.logs.length} aktivitas terakhir</span>
            </div>
            {page.logs.length === 0 ? (
              <p className="muted">Belum ada aktivitas. Coba uji Aijou melalui simulator.</p>
            ) : (
              <div className="transaction-list">
                {page.logs.map((log) => {
                  const copy = getAiActivityCopy(log.actionTaken, log.intent);
                  return (
                  <details className="transaction-item" key={log.id}>
                    <summary>
                      <span>
                        <strong>{copy.title}</strong>
                        <small>
                          {copy.description} · {log.contactName} ·{" "}
                          {new Date(log.createdAt).toLocaleString("id-ID")}
                        </small>
                      </span>
                      <span
                        className={
                          log.confidenceScore !== null && log.confidenceScore < 0.7
                            ? "status status-warning"
                            : "status"
                        }
                      >
                        {formatAiConfidence(log.confidenceScore)}
                      </span>
                    </summary>
                    <div className="ai-log-grid">
                      <div>
                        <h3>Pesan pelanggan</h3>
                        <pre className="ocr-box">{log.inputText || "-"}</pre>
                      </div>
                      <div>
                        <h3>Hasil Aijou</h3>
                        <pre className="ocr-box">{log.outputText || "-"}</pre>
                      </div>
                    </div>
                    <details className="nested-detail">
                      <summary>Detail teknis</summary>
                      <pre className="ocr-box">
                        {JSON.stringify(log.structuredOutput ?? {}, null, 2)}
                      </pre>
                    </details>
                    {log.conversationId ? (
                      <div className="quick-actions">
                        <Link
                          className="ghost-button"
                          href={`/conversations?conversationId=${log.conversationId}`}
                        >
                          Buka percakapan
                        </Link>
                      </div>
                    ) : null}
                  </details>
                  );
                })}
              </div>
            )}
          </div>
        </section>
    </AppShell>
  );
}
