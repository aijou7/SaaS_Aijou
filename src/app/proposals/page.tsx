import { FileText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  deleteProposalDraftAction,
  sendProposalFollowUpAction,
  updateProposalDraftContentAction,
  updateProposalDraftStatusAction,
} from "@/app/proposals/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getProposalDraftsPage } from "@/server/proposals/proposal-drafts";

const proposalStatuses = ["DRAFT", "REVIEWED", "SENT", "ACCEPTED", "REJECTED"];

type ProposalsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProposalsPage({ searchParams }: ProposalsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const params = searchParams ? await searchParams : {};
  const query = getSingleParam(params.q)?.trim() ?? "";
  const status = getSingleParam(params.status)?.trim() ?? "";
  const pageNumber = Math.max(1, Number(getSingleParam(params.page) ?? 1) || 1);
  const page = await getProposalDraftsPage(session.userId, { page: pageNumber, query, status });

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

          <form className="chat-archive-filter" action="/proposals" method="get">
            <input name="q" defaultValue={query} maxLength={120} placeholder="Cari judul, klien, atau project" />
            <select name="status" defaultValue={status} aria-label="Filter status proposal">
              <option value="">Semua proposal aktif</option>
              {proposalStatuses.map((item) => (
                <option key={item} value={item}>{formatStatus(item)}</option>
              ))}
              <option value="ARCHIVED">Archived</option>
            </select>
            <button className="ghost-button" type="submit">Filter</button>
          </form>

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
                      <small>{proposal.proposalNumber ?? "No number"} · Revision {proposal.version}</small>
                      <span className="muted conversation-preview">{proposal.projectSummary}</span>
                    </span>
                    <span className={proposal.status === "ACCEPTED" ? "status" : "status status-warning"}>
                      {formatEstimateRange(proposal.estimatedValueMin, proposal.estimatedValueMax)}
                    </span>
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
                      <form className="form-grid" action={updateProposalDraftStatusAction}>
                        <input name="proposalId" type="hidden" value={proposal.id} />
                        <label>
                          Status
                          <select name="status" defaultValue={proposal.status}>
                            {proposalStatuses.map((status) => (
                              <option key={status} value={status}>
                                {formatStatus(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button className="ghost-button" type="submit">
                          Update status
                        </button>
                      </form>

                      <div className="quick-actions">
                        <form action={sendProposalFollowUpAction}>
                          <input name="proposalId" type="hidden" value={proposal.id} />
                          <button className="primary-button" type="submit">
                            Send follow-up to chat
                          </button>
                        </form>
                        <Link
                          className="ghost-button"
                          href={`/conversations?conversationId=${proposal.lead.conversationId}`}
                        >
                          Open conversation
                        </Link>
                        <Link
                          className="ghost-button"
                          href={`/proposals/${proposal.id}/print`}
                          target="_blank"
                        >
                          Preview / Print PDF
                        </Link>
                        <Link className="ghost-button" href="/leads">
                          Open lead pipeline
                        </Link>
                        <form action={deleteProposalDraftAction}>
                          <input name="proposalId" type="hidden" value={proposal.id} />
                          <button className="small-danger-button" type="submit">
                            Arsipkan draft
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>

                  <details className="proposal-editor">
                    <summary>Edit isi proposal</summary>
                    <form className="form-grid" action={updateProposalDraftContentAction}>
                      <input name="proposalId" type="hidden" value={proposal.id} />
                      <label>
                        Judul
                        <input name="title" defaultValue={proposal.title} maxLength={200} required />
                      </label>
                      <label>
                        Nama klien
                        <input name="clientName" defaultValue={proposal.clientName ?? ""} maxLength={200} />
                      </label>
                      <label className="span-2">
                        Ringkasan project
                        <textarea name="projectSummary" defaultValue={proposal.projectSummary} rows={5} required />
                      </label>
                      <label>
                        Estimasi minimum
                        <input name="estimatedValueMin" type="number" min="0" defaultValue={proposal.estimatedValueMin ?? ""} />
                      </label>
                      <label>
                        Estimasi maksimum
                        <input name="estimatedValueMax" type="number" min="0" defaultValue={proposal.estimatedValueMax ?? ""} />
                      </label>
                      <label>
                        Timeline
                        <input name="timeline" defaultValue={proposal.timeline ?? ""} maxLength={500} />
                      </label>
                      <label>
                        Berlaku sampai
                        <input name="validUntil" type="date" defaultValue={proposal.validUntil ?? ""} />
                      </label>
                      <ProposalTextarea name="scopeOfWork" title="Scope of work" items={proposal.scopeOfWork} />
                      <ProposalTextarea name="assumptions" title="Assumptions" items={proposal.assumptions} />
                      <ProposalTextarea name="exclusions" title="Exclusions" items={proposal.exclusions} />
                      <ProposalTextarea name="nextSteps" title="Next steps" items={proposal.nextSteps} />
                      <label className="span-2">
                        Disclaimer
                        <textarea name="disclaimer" defaultValue={proposal.disclaimer} rows={4} required />
                      </label>
                      <button className="primary-button span-2" type="submit">Simpan revisi</button>
                    </form>
                  </details>

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
          {page.pagination.pageCount > 1 ? (
            <nav className="orders-pagination" aria-label="Pagination proposals">
              {page.pagination.page > 1 ? (
                <Link className="ghost-button" href={proposalPageUrl(query, status, page.pagination.page - 1)}>Sebelumnya</Link>
              ) : <span />}
              <span>Halaman {page.pagination.page} dari {page.pagination.pageCount}</span>
              {page.pagination.page < page.pagination.pageCount ? (
                <Link className="ghost-button" href={proposalPageUrl(query, status, page.pagination.page + 1)}>Berikutnya</Link>
              ) : <span />}
            </nav>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}

function ProposalTextarea({ name, title, items }: { name: string; title: string; items: string[] }) {
  return (
    <label>
      {title} (satu baris per poin)
      <textarea name={name} defaultValue={items.join("\n")} rows={7} />
    </label>
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

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function proposalPageUrl(query: string, status: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/proposals?${value}` : "/proposals";
}
