import { FileText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getProposalDraftsPage } from "@/server/proposals/proposal-drafts";

export default async function ProposalsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getProposalDraftsPage(session.userId);

  return (
    <AppShell active="proposals" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Sales documents</p>
        <h1>Proposal draft otomatis dari lead.</h1>
        <p>
          Draft ini dibuat dari konteks chat, lead summary, estimasi awal, dan next step.
          Pakai sebagai bahan review owner sebelum jadi quotation final.
        </p>
      </section>

      <section className="grid" aria-label="Proposal summary">
        <div className="card">
          <FileText size={22} aria-hidden="true" />
          <h2>Total Draft</h2>
          <div className="metric">{page.summary.total}</div>
          <p className="muted">Proposal draft tersimpan.</p>
        </div>
        <div className="card">
          <FileText size={22} aria-hidden="true" />
          <h2>Draft</h2>
          <div className="metric">{page.summary.draft}</div>
          <p className="muted">Belum difinalisasi.</p>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-header">
            <div>
              <h2>Drafts</h2>
              <p className="muted">Review draft, lalu lanjutkan follow-up dari conversation.</p>
            </div>
            <Link className="ghost-button" href="/leads">
              Back to leads
            </Link>
          </div>

          {page.proposals.length === 0 ? (
            <div className="empty-state">
              <strong>Belum ada proposal draft</strong>
              <p>Buka Leads lalu klik “Generate proposal draft” pada lead yang ingin diproses.</p>
              <Link className="primary-button" href="/leads">
                Open leads
              </Link>
            </div>
          ) : (
            <div className="transaction-list">
              {page.proposals.map((proposal) => (
                <details className="transaction-item" key={proposal.id}>
                  <summary>
                    <span>
                      <strong>{proposal.title}</strong>
                      <small>
                        {proposal.clientName ?? "Unknown client"} · {proposal.status} ·{" "}
                        {proposal.generatedBy} · Created {proposal.createdAt}
                      </small>
                      <span className="muted conversation-preview">{proposal.projectSummary}</span>
                    </span>
                    <span className="status">{formatEstimateRange(proposal.estimatedValueMin, proposal.estimatedValueMax)}</span>
                  </summary>

                  <div className="lead-grid">
                    <div>
                      <h3>Summary</h3>
                      <p>{proposal.projectSummary}</p>
                      <p className="muted">Service: {proposal.lead.serviceInterest ?? "-"}</p>
                      <p className="muted">Lead score: {proposal.lead.qualificationScore ?? 0}/100</p>
                      <p className="muted">Timeline: {proposal.timeline ?? "-"}</p>
                      <p className="muted">{proposal.disclaimer}</p>
                    </div>
                    <div>
                      <h3>Actions</h3>
                      <div className="quick-actions">
                        <Link
                          className="ghost-button"
                          href={`/conversations?conversationId=${proposal.lead.conversationId}`}
                        >
                          Open conversation
                        </Link>
                        <Link className="ghost-button" href={`/leads`}>
                          Open lead pipeline
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="ai-log-grid">
                    <ProposalList title="Scope of work" items={proposal.scopeOfWork} />
                    <ProposalList title="Assumptions" items={proposal.assumptions} />
                    <ProposalList title="Exclusions" items={proposal.exclusions} />
                    <ProposalList title="Next steps" items={proposal.nextSteps} />
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}

function ProposalList({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">-</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatEstimateRange(min?: string | null, max?: string | null) {
  if (!min && !max) {
    return "No estimate";
  }

  if (min && max) {
    return `${formatRupiah(min)} - ${formatRupiah(max)}`;
  }

  return formatRupiah(min ?? max ?? "0");
}

function formatRupiah(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return value;
  }

  return new Intl.NumberFormat("id-ID", {
    currency: "IDR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(numeric);
}
