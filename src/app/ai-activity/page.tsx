import { Activity, AlertTriangle, GitPullRequestArrow } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { formatConfidence, getAiActivityPage } from "@/server/observability/ai-activity";

export default async function AiActivityPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getAiActivityPage(session.userId);

  return (
    <AppShell active="ai-activity" businessName={page.business?.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">Observability</p>
          <h1>Lihat keputusan AI, confidence, dan action yang diambil.</h1>
          <p>
            Halaman ini membantu debug extraction, customer replies, lead summary, receipt OCR,
            dan handoff behavior tanpa buka database.
          </p>
        </section>

        <section className="grid" aria-label="AI activity summary">
          <div className="card">
            <Activity size={22} aria-hidden="true" />
            <h2>Total Logs</h2>
            <div className="metric">{page.summary.totalLogs}</div>
            <p className="muted">Semua AI decision logs.</p>
          </div>
          <div className="card">
            <AlertTriangle size={22} aria-hidden="true" />
            <h2>Low Confidence</h2>
            <div className="metric">{page.summary.lowConfidence}</div>
            <p className="muted">Confidence di bawah 70%.</p>
          </div>
          <div className="card">
            <GitPullRequestArrow size={22} aria-hidden="true" />
            <h2>Handoff Related</h2>
            <div className="metric">{page.summary.handoffRelated}</div>
            <p className="muted">Log yang terkait handoff/takeover.</p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <h2>Latest AI Logs</h2>
              <span className="muted">{page.logs.length} recent logs</span>
            </div>
            {page.logs.length === 0 ? (
              <p className="muted">Belum ada AI log. Coba pakai Simulator dulu.</p>
            ) : (
              <div className="transaction-list">
                {page.logs.map((log) => (
                  <details className="transaction-item" key={log.id}>
                    <summary>
                      <span>
                        <strong>{log.actionTaken}</strong>
                        <small>
                          {log.intent} · {log.contactName} ·{" "}
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
                        {formatConfidence(log.confidenceScore)}
                      </span>
                    </summary>
                    <div className="ai-log-grid">
                      <div>
                        <h3>Input</h3>
                        <pre className="ocr-box">{log.inputText || "-"}</pre>
                      </div>
                      <div>
                        <h3>Output</h3>
                        <pre className="ocr-box">{log.outputText || "-"}</pre>
                      </div>
                    </div>
                    <details className="nested-detail">
                      <summary>Structured output</summary>
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
                          Open conversation
                        </Link>
                      </div>
                    ) : null}
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
    </AppShell>
  );
}
