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
                        <small>{lead.serviceInterest ?? "Service belum jelas"}</small>
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
                          {lead.serviceInterest ?? "Service belum jelas"} · Updated {lead.updatedAt}
                        </small>
                        <span className="muted conversation-preview">{lead.needSummary}</span>
                      </span>
                      <span
                        className={
                          lead.status === "QUALIFIED" ? "status" : "status status-warning"
                        }
                      >
                        {formatLeadStatus(lead.status)}
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
