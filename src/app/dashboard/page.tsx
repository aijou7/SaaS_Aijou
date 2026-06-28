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

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const dashboard = await getFinanceDashboardSnapshot(session.userId);

  return (
    <AppShell active="dashboard" businessName={dashboard.businessName}>
      <div className="dashboard-topbar">
        <div>
          <p className="eyebrow">Aijou control center</p>
          <h1>Setiap percakapan punya langkah yang jelas untuk maju.</h1>
          <p className="muted">
            Aijou menjawab dengan konteks bisnis Anda, membantu pelanggan memilih, lalu
            memberi tim Anda sinyal kapan perlu mengambil alih.
          </p>
        </div>
      </div>

      <section className="onboarding-panel">
        <div>
          <p className="eyebrow">Mulai bersama Aijou</p>
          <h2>Bangun alur percakapan yang siap membantu</h2>
          <p className="muted">
            Mulai dari konteks bisnis, produk, dan channel. Selebihnya Aijou bantu menjaga
            percakapan tetap bergerak.
          </p>
        </div>
        <div className="step-grid">
          <Link className="step-card" href="/training">
            <span>1</span>
            <strong>Latih Aijou</strong>
            <small>Isi knowledge dan contoh percakapan supaya jawaban terasa sesuai bisnis Anda.</small>
          </Link>
          <Link className="step-card" href="/products">
            <span>2</span>
            <strong>Isi Produk</strong>
            <small>Masukkan produk/jasa dan harga supaya AI bisa jualan dengan jelas.</small>
          </Link>
          <Link className="step-card" href="/integrations">
            <span>3</span>
            <strong>Hubungkan channel</strong>
            <small>Sambungkan WhatsApp, lalu siapkan Instagram, Messenger, email, dan web chat.</small>
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
          <span>Percakapan pelanggan</span>
          <strong>{dashboard.customerConversationCount}</strong>
          <p>Chat pelanggan yang dibantu Aijou.</p>
        </div>
        <div className="card metric-card">
          <CheckCircle2 size={22} aria-hidden="true" />
          <span>Pembayaran terkonfirmasi</span>
          <strong>{dashboard.confirmedCount}</strong>
          <p>Order atau payment yang sudah masuk laporan.</p>
        </div>
      </section>

      <section className="section module-map">
        <div className="section-header">
          <div>
            <h2>Ruang kerja Aijou</h2>
            <p className="muted">Setiap modul menjaga percakapan, konteks, dan tindak lanjut tetap selaras.</p>
          </div>
        </div>
        <div className="module-grid">
          <Link className="module-card" href="/conversations">
            <MessageCircle size={22} aria-hidden="true" />
            <strong>Inbox</strong>
            <p>Aijou menjawab chat dengan konteks; tim Anda bisa mengambil alih kapan pun.</p>
          </Link>
          <Link className="module-card" href="/training">
            <Sparkles size={22} aria-hidden="true" />
            <strong>Training</strong>
            <p>Knowledge, .txt, dan percakapan lama untuk membentuk cara Aijou membantu.</p>
          </Link>
          <Link className="module-card" href="/agent">
            <Bot size={22} aria-hidden="true" />
            <strong>AI Agent</strong>
            <p>Atur gaya bahasa, batasan, dan kapan Aijou meneruskan chat ke tim.</p>
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
              <h2>Butuh perhatian Anda</h2>
              <p className="muted">Hal yang paling berguna untuk dicek hari ini.</p>
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
              <span>Butuh bantuan tim</span>
            </Link>
            <Link className="queue-item" href="/conversations">
              <strong>{dashboard.unreadConversationCount}</strong>
              <span>Unread chat</span>
            </Link>
            <Link className="queue-item" href="/leads">
              <strong>{dashboard.hotLeadCount}</strong>
              <span>Hot leads</span>
            </Link>
            <Link className="queue-item" href="/leads">
              <strong>{dashboard.dueFollowUpCount}</strong>
              <span>Follow-up due</span>
            </Link>
            <Link className="queue-item" href="/leads">
              <strong>{dashboard.newLeadCount}</strong>
              <span>Prospek baru</span>
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <h2>Aktivitas Aijou terbaru</h2>
              <p className="muted">Keputusan terbaru yang dibuat berdasarkan percakapan.</p>
            </div>
            <Link className="ghost-button" href="/ai-activity">
              Lihat semua
            </Link>
          </div>
          {dashboard.latestAiActions.length === 0 ? (
            <div className="empty-state">
              <strong>Belum ada aktivitas Aijou</strong>
              <p>Coba kirim chat dari Simulator untuk melihat cara Aijou memproses percakapan.</p>
              <Link className="primary-button" href="/simulator">
                Buka simulator
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
