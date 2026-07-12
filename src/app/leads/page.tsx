import { ClipboardList } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateLeadAction } from "@/app/leads/actions";
import { generateProposalDraftAction } from "@/app/proposals/actions";
import { AppShell } from "@/components/app-shell";
import { LeadStatus } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { getLeadsPage } from "@/server/leads/leads";

type LeadsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const params = searchParams ? await searchParams : {};
  const query = getSingleParam(params.q)?.trim() ?? "";
  const status = getSingleParam(params.status)?.trim() ?? "";
  const pageNumber = Math.max(1, Number(getSingleParam(params.page) ?? 1) || 1);
  const page = await getLeadsPage(session.userId, { page: pageNumber, query, status });

  return (
    <AppShell active="leads" businessName={page.business?.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">Customer opportunities</p>
          <h1>Lead summary otomatis dari conversation customer.</h1>
          <p>
            Setiap chat customer diringkas menjadi lead: kebutuhan, service interest,
            lokasi, budget, urgency, dan status follow-up.
          </p>
        </section>

        <section className="grid" aria-label="Lead summary">
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>New</h2>
            <div className="metric">{page.summary.new}</div>
            <p className="muted">Lead baru.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Need Follow-up</h2>
            <div className="metric">{page.summary.followUp}</div>
            <p className="muted">Perlu owner follow-up.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Qualified</h2>
            <div className="metric">{page.summary.qualified}</div>
            <p className="muted">Kebutuhan cukup jelas.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Won</h2>
            <div className="metric">{page.summary.won}</div>
            <p className="muted">Lead berhasil jadi deal.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Lost</h2>
            <div className="metric">{page.summary.lost}</div>
            <p className="muted">Lead tidak lanjut.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Hot Leads</h2>
            <div className="metric">{page.summary.hot}</div>
            <p className="muted">Score 70+ dan layak cepat di-follow up.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Web Chat</h2>
            <div className="metric">{page.summary.webChat}</div>
            <p className="muted">Masuk dari widget website.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Brief</h2>
            <div className="metric">{page.summary.brief}</div>
            <p className="muted">Masuk dari form brief project.</p>
          </div>
          <div className="card">
            <ClipboardList size={22} aria-hidden="true" />
            <h2>Follow-up Due</h2>
            <div className="metric">{page.summary.dueFollowUp}</div>
            <p className="muted">Lead yang waktunya dikejar lagi.</p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <div>
                <h2>Pipeline pada halaman ini</h2>
                <p className="muted">Ringkasan visual untuk hasil filter yang sedang tampil.</p>
              </div>
            </div>
            <div className="pipeline-grid">
              {Object.values(LeadStatus).map((status) => {
                const leads = page.leads.filter((lead) => lead.status === status);

                return (
                  <div className="pipeline-lane" key={status}>
                    <div className="pipeline-lane-header">
                      <strong>{formatLeadStatus(status)}</strong>
                      <span>{leads.length}</span>
                    </div>
                    {leads.slice(0, 4).map((lead) => (
                      <Link
                        className="pipeline-card"
                        href={`/conversations?conversationId=${lead.conversationId}`}
                        key={lead.id}
                      >
                        <strong>{lead.customerName ?? lead.customerPhone ?? "Unknown lead"}</strong>
                        <small>
                          {lead.serviceInterest ?? "Service belum jelas"} · {lead.source} ·{" "}
                          {lead.qualificationScore ?? 0}/100
                        </small>
                        {lead.isFollowUpDue ? <small>Follow-up due now</small> : null}
                      </Link>
                    ))}
                    {leads.length === 0 ? <p className="muted">Kosong</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <h2>Leads</h2>
              <span className="muted">{page.leads.length} dari {page.pagination.total} leads</span>
            </div>
            <form className="chat-archive-filter" action="/leads" method="get">
              <input name="q" defaultValue={query} maxLength={120} placeholder="Cari nama, nomor, atau kebutuhan" />
              <select name="status" defaultValue={status} aria-label="Filter status lead">
                <option value="">Semua status</option>
                {Object.values(LeadStatus).map((item) => (
                  <option key={item} value={item}>{formatLeadStatus(item)}</option>
                ))}
              </select>
              <button className="ghost-button" type="submit">Filter</button>
            </form>
            {page.leads.length === 0 ? (
              <p className="muted">Belum ada lead. Coba kirim customer chat dari Simulator.</p>
            ) : (
              <div className="transaction-list">
                {page.leads.map((lead) => (
                  <details className="transaction-item" key={lead.id}>
                    <summary>
                      <span>
                        <strong>{lead.customerName ?? lead.customerPhone ?? "Unknown lead"}</strong>
                        <small>
                          {lead.serviceInterest ?? "Service belum jelas"} · {lead.source} · Updated {lead.updatedAt}
                        </small>
                        <span className="muted conversation-preview">{lead.needSummary}</span>
                      </span>
                      <span
                        className={
                          lead.isFollowUpDue || lead.status !== "QUALIFIED"
                            ? "status status-warning"
                            : "status"
                        }
                      >
                        {lead.isFollowUpDue ? "Follow-up due" : formatLeadStatus(lead.status)}
                      </span>
                    </summary>

                    <div className="lead-grid">
                      <div>
                        <h3>Summary</h3>
                        <p>{lead.needSummary}</p>
                        <p className="muted">Phone: {lead.customerPhone ?? "-"}</p>
                        <p className="muted">Location: {lead.location ?? "-"}</p>
                        <p className="muted">Budget: {lead.budget ?? "-"}</p>
                        <p className="muted">Urgency: {lead.urgency ?? "-"}</p>
                        <p className="muted">Lead score: {lead.qualificationScore ?? 0}/100</p>
                        <p className="muted">Source: {lead.source}</p>
                        <p className="muted">
                          Next follow-up: {lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : "-"}
                        </p>
                        {lead.followUpReason ? <p className="muted">{lead.followUpReason}</p> : null}
                        <p className="muted">
                          Estimasi awal: {formatEstimateRange(lead.estimatedValueMin, lead.estimatedValueMax)}
                        </p>
                        {lead.estimateNote ? <p>{lead.estimateNote}</p> : null}
                        {lead.nextStep ? <p className="muted">Next step: {lead.nextStep}</p> : null}
                        <p className="muted">Proposal drafts: {lead.proposalDraftCount}</p>
                        {lead.latestProposalDraft ? (
                          <p className="muted">
                            Latest proposal: {lead.latestProposalDraft.title} · {lead.latestProposalDraft.status}
                          </p>
                        ) : null}
                      </div>
                      <form className="form-grid" action={updateLeadAction}>
                        <input name="leadId" type="hidden" value={lead.id} />
                        <label>
                          Status
                          <select name="status" defaultValue={lead.status}>
                            {Object.values(LeadStatus).map((status) => (
                              <option key={status} value={status}>
                                {formatLeadStatus(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="span-2">
                          Owner Notes
                          <textarea name="ownerNotes" defaultValue={lead.ownerNotes ?? ""} />
                        </label>
                        <button className="primary-button span-2" type="submit">
                          Update lead
                        </button>
                      </form>
                    </div>
                    <div className="quick-actions">
                      <form action={generateProposalDraftAction}>
                        <input name="leadId" type="hidden" value={lead.id} />
                        <button className="primary-button" type="submit">
                          Generate proposal draft
                        </button>
                      </form>
                      {lead.latestProposalDraft ? (
                        <Link className="ghost-button" href="/proposals">
                          View proposal drafts
                        </Link>
                      ) : null}
                      <Link
                        className="ghost-button"
                        href={`/conversations?conversationId=${lead.conversationId}`}
                      >
                        Open conversation
                      </Link>
                    </div>
                  </details>
                ))}
              </div>
            )}
            {page.pagination.pageCount > 1 ? (
              <nav className="orders-pagination" aria-label="Pagination leads">
                {page.pagination.page > 1 ? (
                  <Link className="ghost-button" href={leadPageUrl(query, status, page.pagination.page - 1)}>Sebelumnya</Link>
                ) : <span />}
                <span>Halaman {page.pagination.page} dari {page.pagination.pageCount}</span>
                {page.pagination.page < page.pagination.pageCount ? (
                  <Link className="ghost-button" href={leadPageUrl(query, status, page.pagination.page + 1)}>Berikutnya</Link>
                ) : <span />}
              </nav>
            ) : null}
          </div>
        </section>
    </AppShell>
  );
}

function formatLeadStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatEstimateRange(min?: string | null, max?: string | null) {
  if (!min && !max) {
    return "-";
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function leadPageUrl(query: string, status: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return value ? `/leads?${value}` : "/leads";
}
