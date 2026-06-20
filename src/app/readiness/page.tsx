import { AlertTriangle, BadgeCheck, CheckCircle2, RadioTower, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";
import { getWhatsAppSettingsPage } from "@/server/whatsapp/settings";

export default async function ReadinessPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getBusinessProfilePage(session.userId);
  const whatsApp = await getWhatsAppSettingsPage(session.userId);

  return (
    <AppShell active="readiness" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Go live readiness</p>
        <h1>Cek apa aja yang kurang sebelum WhatsApp real dipasang.</h1>
        <p>
          Halaman ini jadi panel pre-flight: Groq, WhatsApp webhook, business profile,
          agent, dan knowledge base dicek dari satu tempat.
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
          <RadioTower size={22} aria-hidden="true" />
          <h2>WhatsApp</h2>
          <div className="metric">{whatsApp.ready ? "Ready" : "Draft"}</div>
          <p className="muted">Config webhook Meta/WhatsApp Cloud API dari dashboard.</p>
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
          <h2>WhatsApp dashboard settings</h2>
          <div className="env-list">
            <EnvRow name="GROQ_API_KEY" ready={Boolean(process.env.GROQ_API_KEY)} />
            <EnvRow name="Access token" ready={whatsApp.settings?.accessTokenMasked !== "Not set"} />
            <EnvRow name="Verify token" ready={whatsApp.settings?.verifyTokenMasked !== "Not set"} />
            <EnvRow name="Phone number ID" ready={Boolean(whatsApp.settings?.phoneNumberId)} />
            <EnvRow name="App secret" ready={whatsApp.settings?.appSecretMasked !== "Not set"} />
          </div>
          <div className="quick-actions">
            <Link className="primary-button" href="/whatsapp">
              Open WhatsApp settings
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function EnvRow({ name, ready }: { name: string; ready: boolean }) {
  return (
    <div className="env-row">
      <code>{name}</code>
      <span className={ready ? "status" : "status status-warning"}>
        {ready ? "Set" : "Missing"}
      </span>
    </div>
  );
}
