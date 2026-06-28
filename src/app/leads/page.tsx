import { ClipboardList } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateLeadAction } from "@/app/leads/actions";
import { AppShell } from "@/components/app-shell";
import { LeadStatus } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import { getLeadsPage } from "@/server/leads/leads";

export default async function LeadsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getLeadsPage(session.userId);

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
                <h2>Pipeline</h2>
                <p className="muted">Drag belum ada, tapi status pipeline sudah bisa dipakai.</p>
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
              <span className="muted">{page.leads.length} leads</span>
            </div>
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
