import { Activity, MessageCircle, TrendingUp, WalletCards } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatCurrencyIDR } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getFinanceDashboardSnapshot } from "@/server/finance/dashboard";

export default async function ReportsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const dashboard = await getFinanceDashboardSnapshot(session.userId);

  return (
    <AppShell active="reports" businessName={dashboard.businessName}>
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Reports</p>
            <h1>Laporan otomatis dari chat, order, payment, dan AI activity.</h1>
            <p>
              Begitu customer bayar, order masuk revenue. Begitu AI handoff, owner tahu mana
              chat yang perlu diselesaikan.
            </p>
          </div>
        </div>

        <div className="core-metrics">
          <div className="core-metric">
            <WalletCards size={20} aria-hidden="true" />
            <span>Revenue this month</span>
            <strong>{formatCurrencyIDR(dashboard.totalThisMonth)}</strong>
          </div>
          <div className="core-metric">
            <MessageCircle size={20} aria-hidden="true" />
            <span>Customer chats</span>
            <strong>{dashboard.customerConversationCount}</strong>
          </div>
          <div className="core-metric">
            <TrendingUp size={20} aria-hidden="true" />
            <span>New leads</span>
            <strong>{dashboard.newLeadCount}</strong>
          </div>
          <div className="core-metric">
            <Activity size={20} aria-hidden="true" />
            <span>Human needed</span>
            <strong>{dashboard.humanNeededCount}</strong>
          </div>
        </div>

        <div className="core-grid">
          <section className="core-card">
            <div className="section-header">
              <div>
                <h2>Latest AI actions</h2>
                <p className="muted">Log keputusan AI terakhir.</p>
              </div>
              <Link className="ghost-button" href="/ai-activity">
                View all
              </Link>
            </div>
            <div className="activity-list">
              {dashboard.latestAiActions.length === 0 ? (
                <div className="empty-state">
                  <strong>Belum ada AI activity</strong>
                  <p>Coba kirim chat dari Simulator.</p>
                </div>
              ) : (
                dashboard.latestAiActions.map((action) => (
                  <Link className="activity-row" href="/ai-activity" key={action.id}>
                    <span>
                      <strong>{action.actionTaken}</strong>
                      <small>{action.intent}</small>
                    </span>
                    <span className="status">
                      {action.confidenceScore === null
                        ? "-"
                        : `${Math.round(action.confidenceScore * 100)}%`}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>

          <section className="core-card">
            <div className="section-header">
              <div>
                <h2>Recent paid/order records</h2>
                <p className="muted">Data ini sementara bersumber dari transaction/order MVP.</p>
              </div>
              <Link className="ghost-button" href="/transactions">
                Open orders
              </Link>
            </div>
            <div className="feature-row-list">
              {dashboard.recentTransactions.length === 0 ? (
                <div className="empty-state">
                  <strong>Belum ada order/payment</strong>
                  <p>Order dari AI atau manual akan muncul di sini.</p>
                </div>
              ) : (
                dashboard.recentTransactions.map((transaction) => (
                  <Link className="feature-row" href="/transactions" key={transaction.id}>
                    <span>
                      <strong>{transaction.description}</strong>
                      <small>{transaction.status}</small>
                    </span>
                    <strong>{formatCurrencyIDR(transaction.amount)}</strong>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
