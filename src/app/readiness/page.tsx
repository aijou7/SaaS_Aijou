import { AlertTriangle, BadgeCheck, CheckCircle2, Globe2, Send, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";

export default async function ReadinessPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getBusinessProfilePage(session.userId);

  return (
    <AppShell active="readiness" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Go live readiness</p>
        <h1>Cek apa aja yang kurang sebelum agent mulai menerima chat real.</h1>
        <p>
          Halaman ini jadi panel pre-flight: Groq, business profile, agent, knowledge base,
          Telegram, web chat, dan WhatsApp dicek dari satu tempat.
        </p>
      </section>

      <section className="grid" aria-label="Readiness summary">
        <div className="card">
          <BadgeCheck size={22} aria-hidden="true" />
          <h2>Readiness</h2>
          <div className="metric">{page.readiness.percent}%</div>
          <p className="muted">
            {page.readiness.completed}/{page.readiness.total} checklist selesai.
          </p>
        </div>
        <div className="card">
          <Globe2 size={22} aria-hidden="true" />
          <h2>Web Live Chat</h2>
          <div className="metric">{page.readiness.channels.web ? "Ready" : "Draft"}</div>
          <p className="muted">
            {page.readiness.channels.webConfigured
              ? "Domain tersimpan; kirim chat percobaan agar widget terdeteksi."
              : "Simpan origin website lalu pasang snippet widget."}
          </p>
        </div>
        <div className="card">
          <Send size={22} aria-hidden="true" />
          <h2>Telegram</h2>
          <div className="metric">{page.readiness.channels.telegram ? "Ready" : "Draft"}</div>
          <p className="muted">Bot token dan webhook dikelola langsung dari dashboard.</p>
        </div>
        <div className="card">
          <ShieldCheck size={22} aria-hidden="true" />
          <h2>Groq</h2>
          <div className="metric">{process.env.GROQ_API_KEY ? "Active" : "Setup"}</div>
          <p className="muted">Provider AI gratis tahap awal.</p>
        </div>
      </section>

      <section className="section split-layout">
        <div className="card">
          <div className="section-header">
            <div>
              <h2>Checklist</h2>
              <p className="muted">Klik item yang belum ready untuk langsung dibenerin.</p>
            </div>
          </div>
          <div className="checklist">
            {page.readiness.checks.map((check) => (
              <Link className="checklist-item" href={check.href} key={check.key}>
                {check.done ? (
                  <CheckCircle2 size={20} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={20} aria-hidden="true" />
                )}
                <span>
                  <strong>{check.label}</strong>
                  <small>{check.description}</small>
                </span>
                <span className={check.done ? "status" : "status status-warning"}>
                  {check.done ? "Ready" : "Missing"}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Status channel</h2>
          <div className="env-list">
            <EnvRow name="GROQ_API_KEY" ready={Boolean(process.env.GROQ_API_KEY)} />
            <EnvRow
              name="Web Live Chat"
              ready={page.readiness.channels.web}
              pending={page.readiness.channels.webConfigured}
            />
            <EnvRow name="Telegram" ready={page.readiness.channels.telegram} />
            <EnvRow name="WhatsApp" ready={page.readiness.channels.whatsapp} />
          </div>
          <div className="quick-actions">
            <Link className="primary-button" href="/integrations">
              Open integrations
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function EnvRow({ name, ready, pending = false }: { name: string; ready: boolean; pending?: boolean }) {
  return (
    <div className="env-row">
      <code>{name}</code>
      <span className={ready ? "status" : "status status-warning"}>
        {ready ? "Set" : pending ? "Needs test" : "Missing"}
      </span>
    </div>
  );
}
