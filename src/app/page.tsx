import {
  Bot,
  CheckCircle2,
  ClipboardCheck,
  MessageCircle,
  ReceiptText,
  Sparkles,
  WalletCards,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatCurrencyIDR } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getFinanceDashboardSnapshot } from "@/server/finance/dashboard";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const dashboard = await getFinanceDashboardSnapshot(session.userId);

  return (
    <AppShell active="dashboard" businessName={dashboard.businessName}>
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Control center</p>
          <h1>AI agent 24 jam buat balas chat, rekomendasi produk, dan bantu closing.</h1>
          <p className="muted">
            Fokus app ini sederhana: klien chat, AI jawab pakai training data, AI arahkan ke
            produk, payment dibuat, dan laporan otomatis update.
          </p>
        </div>
      </div>

      <section className="onboarding-panel">
        <div>
          <p className="eyebrow">Quick start</p>
          <h2>Flow utama yang perlu matang dulu</h2>
          <p className="muted">
            Jangan kebanyakan fitur dulu. Semua halaman harus mendukung flow chat sampai paid.
          </p>
        </div>
        <div className="step-grid">
          <Link className="step-card" href="/training">
            <span>1</span>
            <strong>Train AI</strong>
            <small>Isi knowledge, upload .txt, dan import contoh percakapan WhatsApp lama.</small>
          </Link>
          <Link className="step-card" href="/products">
            <span>2</span>
            <strong>Isi Produk</strong>
            <small>Masukkan produk/jasa dan harga supaya AI bisa jualan dengan jelas.</small>
          </Link>
          <Link className="step-card" href="/integrations">
            <span>3</span>
            <strong>Connect Channel</strong>
            <small>Sambungkan WhatsApp dulu, lalu siapkan slot Instagram, Messenger, email, web chat.</small>
          </Link>
        </div>
      </section>

      <section className="grid" aria-label="Ringkasan MVP">
        <div className="card metric-card">
          <WalletCards size={22} aria-hidden="true" />
          <span>Revenue Bulan Ini</span>
          <strong>{formatCurrencyIDR(dashboard.totalThisMonth)}</strong>
          <p>Masuk otomatis dari order/payment yang sudah confirmed.</p>
        </div>
        <div className="card metric-card">
          <MessageCircle size={22} aria-hidden="true" />
          <span>Customer Chats</span>
          <strong>{dashboard.customerConversationCount}</strong>
          <p>Chat klien yang diproses AI agent.</p>
        </div>
        <div className="card metric-card">
          <CheckCircle2 size={22} aria-hidden="true" />
          <span>Paid / Confirmed</span>
          <strong>{dashboard.confirmedCount}</strong>
          <p>Order atau payment yang sudah masuk laporan.</p>
        </div>
      </section>

      <section className="section module-map">
        <div className="section-header">
          <div>
            <h2>Ada apa aja di app ini?</h2>
            <p className="muted">Peta modul inti, semuanya mendukung AI closing flow.</p>
          </div>
        </div>
        <div className="module-grid">
          <Link className="module-card" href="/conversations">
            <MessageCircle size={22} aria-hidden="true" />
            <strong>Inbox</strong>
            <p>AI jawab chat klien 24 jam, owner bisa take over kapan pun.</p>
          </Link>
          <Link className="module-card" href="/training">
            <Sparkles size={22} aria-hidden="true" />
            <strong>Training</strong>
            <p>Manual knowledge, .txt, dan percakapan WhatsApp lama buat bahan belajar AI.</p>
          </Link>
          <Link className="module-card" href="/agent">
            <Bot size={22} aria-hidden="true" />
            <strong>AI Agent</strong>
            <p>Atur tone, bahasa, handoff rules, dan instruksi closing.</p>
          </Link>
          <Link className="module-card" href="/products">
            <ReceiptText size={22} aria-hidden="true" />
            <strong>Products</strong>
            <p>Catalog produk/jasa dan harga yang dipakai AI saat menawarkan solusi.</p>
          </Link>
          <Link className="module-card" href="/payments">
            <WalletCards size={22} aria-hidden="true" />
            <strong>Payments</strong>
            <p>Xendit, QRIS, VA, dan payment status yang update otomatis.</p>
          </Link>
          <Link className="module-card" href="/integrations">
            <ClipboardCheck size={22} aria-hidden="true" />
            <strong>Integrations</strong>
            <p>WhatsApp, Instagram, Messenger, email, TikTok, dan web live chat.</p>
          </Link>
        </div>
      </section>

      <section className="section split-layout">
        <div className="card">
          <div className="section-header">
            <div>
              <h2>Action Queue</h2>
              <p className="muted">Hal yang perlu owner cek hari ini.</p>
            </div>
          </div>
          <div className="queue-grid">
            <Link className="queue-item" href="/transactions?status=PENDING_CONFIRMATION">
              <strong>{dashboard.pendingTransactionCount}</strong>
              <span>Pending payments</span>
            </Link>
            <Link className="queue-item" href="/reports">
              <strong>{dashboard.confirmedCount}</strong>
              <span>Paid records</span>
            </Link>
            <Link className="queue-item" href="/conversations">
              <strong>{dashboard.humanNeededCount}</strong>
              <span>Human needed</span>
            </Link>
            <Link className="queue-item" href="/leads">
              <strong>{dashboard.newLeadCount}</strong>
              <span>New leads</span>
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <h2>Latest AI Actions</h2>
              <p className="muted">Debug cepat keputusan AI terakhir.</p>
            </div>
            <Link className="ghost-button" href="/ai-activity">
              View all
            </Link>
          </div>
          {dashboard.latestAiActions.length === 0 ? (
            <div className="empty-state">
              <strong>Belum ada AI activity</strong>
              <p>Coba kirim chat dari Simulator untuk melihat Groq extraction/reply log.</p>
              <Link className="primary-button" href="/simulator">
                Open simulator
              </Link>
            </div>
          ) : (
            <div className="activity-list">
              {dashboard.latestAiActions.map((action) => (
                <Link
                  className="activity-row"
                  href={
                    action.conversationId
                      ? `/conversations?conversationId=${action.conversationId}`
                      : "/ai-activity"
                  }
                  key={action.id}
                >
                  <span>
                    <strong>{action.actionTaken}</strong>
                    <small>{action.intent}</small>
                  </span>
                  <span
                    className={
                      action.confidenceScore !== null && action.confidenceScore < 0.7
                        ? "status status-warning"
                        : "status"
                    }
                  >
                    {action.confidenceScore === null
                      ? "-"
                      : `${Math.round(action.confidenceScore * 100)}%`}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <div className="section-header">
            <div>
              <h2>Transaksi Terbaru</h2>
              <p className="muted">Order/payment yang sudah masuk dari chat AI atau manual.</p>
            </div>
            <Link className="ghost-button" href="/payments">
              Open payments
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Deskripsi</th>
                <th>Kategori</th>
                <th>Project</th>
                <th>Sumber</th>
                <th>Nominal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.recentTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      <strong>Belum ada transaksi</strong>
                      <span>Mulai dari Simulator atau tambah manual di Transactions.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                dashboard.recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{transaction.description}</td>
                    <td>{transaction.category}</td>
                    <td>{transaction.project}</td>
                    <td>{formatSource(transaction.source)}</td>
                    <td>{formatCurrencyIDR(transaction.amount)}</td>
                    <td>
                      <span
                        className={
                          transaction.status === "CONFIRMED"
                            ? "status"
                            : "status status-warning"
                        }
                      >
                        {formatStatus(transaction.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function formatStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSource(source: string) {
  return source
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
