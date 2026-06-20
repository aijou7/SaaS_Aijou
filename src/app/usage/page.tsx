import { ChevronUp, RefreshCcw } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";

const usageSections = [
  {
    title: "Custom Channel",
    metric: "0",
    helper: "Channels remaining of 0",
    used: "0%",
    progress: 0,
  },
  {
    title: "Chat Credit",
    metric: "100",
    helper: "AI Credit remaining of 100",
    used: "0%",
    progress: 0,
    footer: "0 AI Credit remaining",
    action: "Top up",
  },
  {
    title: "Contact (MAU)",
    metric: "14",
    helper: "MAU remaining of 20",
    used: "30%",
    progress: 30,
  },
  {
    title: "Automation Runs",
    metric: "250",
    helper: "Runs remaining of 250",
    used: "0%",
    progress: 0,
  },
];

export default async function UsagePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getBusinessProfilePage(session.userId);

  return (
    <AppShell active="usage" businessName={page.business?.businessName}>
      <section className="usage-page content-panel">
        <div className="usage-header">
          <div>
            <h1>Usage</h1>
            <p>Monitor quota usage across all active modules</p>
          </div>
        </div>

        <div className="usage-plan-card">
          <div className="usage-plan-header">
            <div>
              <h2>Chat - Free</h2>
              <p>Renews Jul 4, 2026</p>
            </div>
            <ChevronUp size={18} aria-hidden="true" />
          </div>

          <div className="usage-section-list">
            {usageSections.map((section) => (
              <div className="usage-section" key={section.title}>
                <div className="usage-section-title">
                  <h3>{section.title}</h3>
                  <span>{section.used} used</span>
                </div>
                <div className="usage-metric">
                  <span>{section.title}</span>
                  <strong>{section.metric}</strong>
                  <small>{section.helper}</small>
                </div>
                <div className="usage-progress">
                  <span style={{ width: `${section.progress}%` }} />
                </div>
                <p className="usage-reset">
                  <RefreshCcw size={13} aria-hidden="true" />
                  Limit resets on the 1st of every month
                </p>
                {section.footer ? (
                  <div className="usage-footer-row">
                    <span>{section.footer}</span>
                    <button className="ghost-button" type="button">
                      {section.action}
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
