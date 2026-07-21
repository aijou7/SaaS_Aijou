import {
  Bot,
  Building2,
  CheckCircle2,
  MessageCircle,
  PlayCircle,
  RadioTower,
  Sparkles,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOnboardingAction } from "@/app/setup/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";

type SetupPageProps = {
  searchParams: Promise<{ welcome?: string; error?: string }>;
};

const setupIcons = {
  "business-profile": Building2,
  "agent-config": Bot,
  knowledge: Sparkles,
  simulator: PlayCircle,
  groq: RadioTower,
  channel: MessageCircle,
  "agent-active": CheckCircle2,
} as const;

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const [page, params] = await Promise.all([
    getBusinessProfilePage(session.userId),
    searchParams,
  ]);
  const firstMissing = page.readiness.checks.find((check) => !check.done);

  return (
    <AppShell active="setup" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">
          {params.welcome === "1" ? "Selamat datang di Aijou" : "Setup workspace"}
        </p>
        <h1>Siapkan konteks, uji alurnya, lalu aktifkan saat benar-benar siap.</h1>
        <p>
          Mulai dari profil dan knowledge, coba lewat simulator, lalu hubungkan Web Live
          Chat atau Telegram. Auto-reply tetap nonaktif sampai Anda menyalakannya sendiri.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href={firstMissing?.href ?? "/dashboard"}>
            {firstMissing ? "Lanjutkan setup" : "Buka dashboard"}
          </Link>
          <Link className="ghost-button" href="/readiness">
            Check readiness
          </Link>
        </div>
      </section>

      {params.welcome === "1" ? (
        <div className="settings-note" role="status">
          <strong>Workspace berhasil dibuat</strong>
          <p>
            Aijou masih dalam mode aman dan belum membalas channel secara otomatis.
            Ikuti checklist di bawah, lakukan tes, lalu aktifkan saat sudah yakin.
          </p>
        </div>
      ) : null}
      {params.error === "not_ready" ? (
        <div className="settings-note" role="alert">
          <strong>Onboarding belum bisa diselesaikan</strong>
          <p>Lengkapi seluruh item yang masih berstatus Needs setup, termasuk aktivasi Aijou.</p>
        </div>
      ) : null}

      <section className="grid" aria-label="Setup progress">
        <div className="card">
          <CheckCircle2 size={22} aria-hidden="true" />
          <h2>Progress</h2>
          <div className="metric">{page.readiness.percent}%</div>
          <p className="muted">
            {page.readiness.completed}/{page.readiness.total} readiness check selesai.
          </p>
        </div>
        <div className="card">
          <Sparkles size={22} aria-hidden="true" />
          <h2>Knowledge Aktif</h2>
          <div className="metric">{page.readiness.activeKnowledgeCount}</div>
          <p className="muted">Minimal 3 item aktif diperlukan sebelum auto-reply.</p>
        </div>
        <div className="card">
          <MessageCircle size={22} aria-hidden="true" />
          <h2>Status</h2>
          <div className="metric">{page.business?.onboardingCompleted ? "Done" : "Draft"}</div>
          <p className="muted">
            {page.readiness.readyToComplete
              ? "Semua pemeriksaan siap untuk diselesaikan."
              : "Selesai hanya setelah semua pemeriksaan benar-benar siap."}
          </p>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-header">
            <div>
              <h2>Setup Steps</h2>
              <p className="muted">Klik tiap step, isi datanya, lalu balik ke sini.</p>
            </div>
            {!page.business?.onboardingCompleted ? (
              <form action={completeOnboardingAction}>
                <button
                  className="primary-button"
                  type="submit"
                  disabled={!page.readiness.readyToComplete}
                >
                  Selesaikan onboarding
                </button>
              </form>
            ) : (
              <span className="status">Onboarding selesai</span>
            )}
          </div>
          <div className="setup-step-list">
            {page.readiness.checks.map((step, index) => {
              const Icon = setupIcons[step.key];

              return (
                <Link className="setup-step-row" href={step.href} key={step.key}>
                  <span className={step.done ? "setup-step-index done" : "setup-step-index"}>
                    {step.done ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}
                  </span>
                  <Icon size={20} aria-hidden="true" />
                  <span>
                    <strong>{step.label}</strong>
                    <small>{step.description}</small>
                  </span>
                  <span className={step.done ? "status" : "status status-warning"}>
                    {step.done ? "Ready" : "Needs setup"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
