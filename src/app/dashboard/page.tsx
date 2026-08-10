import {
  Bot,
  Building2,
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
import { formatAiConfidence, getAiActivityCopy } from "@/lib/ai-activity-labels";
import { formatCurrencyIDR } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getFinanceDashboardSnapshot } from "@/server/finance/dashboard";

type DashboardPageProps = {
  searchParams: Promise<{
    onboarding?: string;
    deletionCancelled?: string;
    welcome?: string;
    emailVerified?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  if (session.role === "AGENT") {
    redirect("/conversations" as Route);
  }

  const [dashboard, params] = await Promise.all([
    getFinanceDashboardSnapshot(session.userId),
    searchParams,
  ]);

  if (
    session.role === "OWNER" &&
    dashboard.isWorkspaceEmpty &&
    !dashboard.onboardingCompleted
  ) {
    return (
      <AppShell active="dashboard" businessName={dashboard.businessName} workspaceRole={session.role ?? "VIEWER"}>
        <section className="new-workspace-dashboard">
          <div className="new-workspace-welcome">
            <span className="new-workspace-icon" aria-hidden="true">
              <Sparkles size={26} />
            </span>
            <p className="eyebrow">
              {params.welcome === "1" ? "Akun berhasil diaktifkan" : "Workspace baru"}
            </p>
            <h1>{dashboard.businessName} siap kamu atur dari nol.</h1>
            <p>
              Workspace ini belum berisi chat, customer, lead, produk, transaksi, atau
              data contoh. Mulai dengan melengkapi konteks bisnis agar Aijou tidak menebak.
            </p>
            <div className="new-workspace-actions">
              <Link className="primary-button" href="/setup?welcome=1">
                Mulai setup workspace
              </Link>
              <Link className="ghost-button" href="/business">
                Isi profil bisnis
              </Link>
            </div>
          </div>

          <div className="new-workspace-steps" aria-label="Langkah awal workspace">
            <Link href="/business">
              <span><Building2 size={20} aria-hidden="true" /></span>
              <div>
                <small>Langkah 1</small>
                <strong>Kenalkan bisnismu</strong>
                <p>Isi layanan, area, jam operasional, dan website resmi.</p>
              </div>
            </Link>
            <Link href="/agent">
              <span><Bot size={20} aria-hidden="true" /></span>
              <div>
                <small>Langkah 2</small>
                <strong>Atur cara AI menjawab</strong>
                <p>Tentukan nama, gaya bahasa, batasan, dan aturan handoff.</p>
              </div>
            </Link>
            <Link href="/training">
              <span><Sparkles size={20} aria-hidden="true" /></span>
              <div>
                <small>Langkah 3</small>
                <strong>Masukkan knowledge</strong>
                <p>Tambahkan informasi yang benar sebelum mengaktifkan channel.</p>
              </div>
            </Link>
          </div>

          <div className="new-workspace-privacy-note">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>
              Data setiap workspace terisolasi. Hanya data yang kamu atau channel-mu
              masukkan yang akan tampil di dashboard ini.
            </span>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell active="dashboard" businessName={dashboard.businessName} workspaceRole={session.role ?? "VIEWER"}>
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

      {params.onboarding === "complete" && dashboard.onboardingCompleted ? (
        <div className="settings-note" role="status">
          <strong>Workspace siap digunakan</strong>
          <p>Onboarding selesai dan status auto-reply mengikuti aktivasi yang Anda pilih.</p>
        </div>
      ) : null}

      {params.deletionCancelled === "1" ? (
        <div className="settings-note" role="status">
          <strong>Penghapusan akun dibatalkan</strong>
          <p>Akun dan data workspace tetap aktif karena kamu berhasil masuk kembali.</p>
        </div>
      ) : null}

      {session.role === "OWNER" && !dashboard.onboardingCompleted ? (
        <section className="onboarding-panel">
          <div>
            <p className="eyebrow">Mulai bersama Aijou</p>
            <h2>Selesaikan setup sebelum auto-reply dinyalakan</h2>
            <p className="muted">
              Isi konteks bisnis, uji percakapan, lalu hubungkan Web Live Chat atau Telegram.
              Aijou baru aktif setelah Anda menyalakannya sendiri.
            </p>
          </div>
          <div className="step-grid">
            <Link className="step-card" href="/setup">
              <span>1</span>
              <strong>Lengkapi checklist</strong>
              <small>Lihat setup yang benar-benar sudah siap dan bagian yang masih kurang.</small>
            </Link>
            <Link className="step-card" href="/simulator">
              <span>2</span>
              <strong>Uji percakapan</strong>
              <small>Coba jawaban dan handoff tanpa mengaktifkan auto-reply di channel live.</small>
            </Link>
            <Link className="step-card" href="/integrations">
              <span>3</span>
              <strong>Hubungkan channel</strong>
              <small>Mulai dari widget website atau bot Telegram yang sudah tersedia.</small>
            </Link>
          </div>
        </section>
      ) : null}

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
          {session.role !== "VIEWER" ? <Link className="module-card" href="/training">
            <Sparkles size={22} aria-hidden="true" />
            <strong>Training</strong>
            <p>Knowledge, .txt, dan percakapan lama untuk membentuk cara Aijou membantu.</p>
          </Link> : null}
          {session.role !== "VIEWER" ? <Link className="module-card" href="/agent">
            <Bot size={22} aria-hidden="true" />
            <strong>AI Agent</strong>
            <p>Atur gaya bahasa, batasan, dan kapan Aijou meneruskan chat ke tim.</p>
          </Link> : null}
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
          {session.role !== "VIEWER" ? <Link className="module-card" href="/integrations">
            <ClipboardCheck size={22} aria-hidden="true" />
            <strong>Integrations</strong>
            <p>Web Live Chat dan Telegram siap dipakai; WhatsApp tersedia setelah setup Meta.</p>
          </Link> : null}
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
              <span>Menunggu konfirmasi pembayaran</span>
            </Link>
            <Link className="queue-item" href="/reports">
              <strong>{dashboard.confirmedCount}</strong>
              <span>Pembayaran selesai</span>
            </Link>
            <Link className="queue-item" href="/conversations?status=HUMAN_NEEDED">
              <strong>{dashboard.humanNeededCount}</strong>
              <span>Butuh bantuan tim</span>
            </Link>
            <Link className="queue-item" href="/conversations?unread=1">
              <strong>{dashboard.unreadConversationCount}</strong>
              <span>Belum dibaca</span>
            </Link>
            <Link className="queue-item" href="/leads">
              <strong>{dashboard.hotLeadCount}</strong>
              <span>Prospek potensial</span>
            </Link>
            <Link className="queue-item" href="/leads">
              <strong>{dashboard.dueFollowUpCount}</strong>
              <span>Perlu ditindaklanjuti</span>
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
              <h2>Yang baru dilakukan Aijou</h2>
              <p className="muted">Yang baru saja Aijou kerjakan untuk membantu pelanggan dan tim.</p>
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
              {dashboard.latestAiActions.map((action) => {
                const copy = getAiActivityCopy(action.actionTaken, action.intent);
                return (
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
                      <strong>{copy.title}</strong>
                      <small>{copy.description}</small>
                    </span>
                    <span
                      className={
                        action.confidenceScore !== null && action.confidenceScore < 0.7
                          ? "status status-warning"
                          : "status"
                      }
                    >
                      {formatAiConfidence(action.confidenceScore)}
                    </span>
                  </Link>
                );
              })}
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
