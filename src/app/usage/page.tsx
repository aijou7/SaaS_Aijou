import { Activity, Bot, CircleDollarSign, Clock3, CreditCard, MessageCircle, RadioTower, RefreshCcw } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getUsageSnapshot } from "@/server/observability/usage";

export default async function UsagePage() {
  const session = await getSession();
  if (!session) redirect("/login" as Route);
  const usage = await getUsageSnapshot(session.userId);
  if (!usage) redirect("/setup" as Route);

  const sections = [
    { title: "Channel aktif", metric: usage.channels, helper: "Web widget + WhatsApp + Telegram", icon: RadioTower },
    { title: "Pesan bulan ini", metric: usage.messages, helper: "Inbound dan outbound tersimpan", icon: MessageCircle },
    { title: "Percakapan aktif", metric: usage.conversations, helper: "Conversation dengan aktivitas bulan ini", icon: Activity },
    { title: "AI runs", metric: usage.aiRequests, helper: "Reply, lead summary, dan proposal", icon: Bot },
    { title: "Automation jobs", metric: usage.automationRuns, helper: "Background workflow yang dijadwalkan", icon: RefreshCcw },
    { title: "Payment sessions", metric: usage.paymentSessions, helper: "Hosted checkout yang dibuat", icon: CreditCard },
    { title: "Token AI", metric: usage.inputTokens + usage.outputTokens, helper: `${usage.instrumentedAiRequests} request terinstrumentasi`, icon: Bot },
    { title: "Latency AI", metric: `${usage.averageLatencyMs} ms`, helper: `${usage.aiFailures} request gagal`, icon: Clock3 },
    { title: "Estimasi biaya AI", metric: `$${usage.estimatedCostUsd.toFixed(4)}`, helper: "Berdasarkan rate environment provider", icon: CircleDollarSign },
  ];

  return (
    <AppShell active="usage" businessName={usage.businessName}>
      <section className="usage-page content-panel">
        <div className="usage-header">
          <div>
            <p className="eyebrow">Live metrics</p>
            <h1>Penggunaan workspace</h1>
            <p>Angka di bawah dibaca langsung dari aktivitas workspace, bukan data contoh.</p>
          </div>
          <span className={usage.spendAlert ? "status status-warning" : "status"}>
            {usage.spendAlert ? "Perlu cek biaya AI" : "Private beta · tanpa hard limit kecil"}
          </span>
        </div>
        <div className="usage-plan-card">
          <div className="usage-plan-header">
            <div>
              <h2>Aijou Private Beta</h2>
              <p>Periode baru mulai {new Date(usage.nextResetAt).toLocaleDateString("id-ID")}</p>
            </div>
          </div>
          <div className="usage-section-list">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <div className="usage-section" key={section.title}>
                  <div className="usage-section-title">
                    <h3>{section.title}</h3>
                    <Icon size={18} aria-hidden="true" />
                  </div>
                  <div className="usage-metric">
                    <strong>{typeof section.metric === "number" ? section.metric.toLocaleString("id-ID") : section.metric}</strong>
                    <small>{section.helper}</small>
                  </div>
                  <p className="usage-reset">Tidak ada quota kecil yang memotong kebutuhan chat tester.</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
