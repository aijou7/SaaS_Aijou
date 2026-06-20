import {
  Bot,
  Building2,
  CheckCircle2,
  MessageCircle,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { completeOnboardingAction } from "@/app/setup/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";

export default async function SetupPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getBusinessProfilePage(session.userId);

  const steps = [
    {
      title: "Business Profile",
      description: "Isi nama bisnis, layanan, area, jam operasional, dan nomor WhatsApp.",
      href: "/business",
      icon: Building2,
      done: page.readiness.checks.find((check) => check.key === "business-profile")?.done ?? false,
    },
    {
      title: "Agent Personality",
      description: "Atur nama agent, tone, bahasa, system instruction, dan aturan handoff.",
      href: "/agent",
      icon: Bot,
      done: page.readiness.checks.find((check) => check.key === "agent")?.done ?? false,
    },
    {
      title: "Knowledge Base",
      description: "Tambahkan layanan, FAQ, pricing guardrail, dan handoff rules.",
      href: "/knowledge",
      icon: Sparkles,
      done: page.readiness.checks.find((check) => check.key === "knowledge")?.done ?? false,
    },
    {
      title: "Test Simulator",
      description: "Coba expense assistant dan customer chat sebelum webhook real.",
      href: "/simulator",
      icon: PlayCircle,
      done: true,
    },
    {
      title: "WhatsApp Settings",
      description: "Isi access token, verify token, phone number ID, dan app secret dari dashboard.",
      href: "/whatsapp",
      icon: MessageCircle,
      done: page.readiness.checks.find((check) => check.key === "whatsapp")?.done ?? false,
    },
    {
      title: "Go Live",
      description: "Cek Groq, WhatsApp token, webhook secret, dan kesiapan agent.",
      href: "/readiness",
      icon: CheckCircle2,
      done: page.readiness.percent >= 80,
    },
  ];

  return (
    <AppShell active="setup" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Setup wizard</p>
        <h1>Mulai dari sini supaya app-nya langsung kebaca.</h1>
        <p>
          Wizard ini ngarahin urutan setup dari profil bisnis sampai siap live WhatsApp.
          Selesaikan checklist, lalu tandai onboarding selesai.
        </p>
        <div className="hero-actions">
          <Link className="primary-button" href="/business">
            Start setup
          </Link>
          <Link className="ghost-button" href="/readiness">
            Check readiness
          </Link>
        </div>
      </section>

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
          <p className="muted">Minimal 3 item aktif direkomendasikan.</p>
        </div>
        <div className="card">
          <MessageCircle size={22} aria-hidden="true" />
          <h2>Status</h2>
          <div className="metric">{page.business?.onboardingCompleted ? "Done" : "Draft"}</div>
          <p className="muted">Onboarding bisa ditandai selesai kapan saja.</p>
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-header">
            <div>
              <h2>Setup Steps</h2>
              <p className="muted">Klik tiap step, isi datanya, lalu balik ke sini.</p>
            </div>
            <form action={completeOnboardingAction}>
              <button className="primary-button" type="submit">
                Mark onboarding done
              </button>
            </form>
          </div>
          <div className="setup-step-list">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <Link className="setup-step-row" href={step.href} key={step.title}>
                  <span className={step.done ? "setup-step-index done" : "setup-step-index"}>
                    {step.done ? <CheckCircle2 size={18} aria-hidden="true" /> : index + 1}
                  </span>
                  <Icon size={20} aria-hidden="true" />
                  <span>
                    <strong>{step.title}</strong>
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
