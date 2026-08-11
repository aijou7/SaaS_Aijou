import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Database,
  History,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  activateWorkspacePlanAction,
  adjustWorkspaceTrialAction,
  replayDeveloperJobAction,
  runTrialLifecycleAction,
  setDeveloperUserStatusAction,
} from "@/app/developer/actions";
import { AijouLogo } from "@/components/aijou-logo";
import {
  SubscriptionBillingCycle,
  SubscriptionPlan,
  UserStatus,
  WorkspaceSubscriptionStatus,
} from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { formatIdr } from "@/lib/subscription-plans";
import { getDeveloperConsole } from "@/server/admin-cockpit";

type DeveloperPageProps = {
  searchParams: Promise<{
    q?: string;
    status?: string;
    saved?: string;
    error?: string;
  }>;
};

export default async function DeveloperPage({ searchParams }: DeveloperPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  if (!session) redirect("/login?next=%2Fdeveloper");
  if (!session.isPlatformAdmin) return <DeveloperAccessDenied />;
  const page = await getDeveloperConsole(session.userId, {
    q: params.q,
    subscriptionStatus: params.status,
  });

  return (
    <main className="developer-page">
      <header className="developer-header">
        <div className="developer-brand">
          <AijouLogo size={38} />
          <div><strong>Aijou Developer</strong><span>Platform operations</span></div>
        </div>
        <div className="developer-header-actions">
          <span className="developer-secure-label"><ShieldCheck size={16} /> Akses platform</span>
          <Link className="secondary-button" href="/dashboard"><ArrowLeft size={16} /> Kembali ke workspace</Link>
        </div>
      </header>

      <div className="developer-content">
        <section className="developer-hero">
          <div>
            <p className="eyebrow">Control center</p>
            <h1>Kendalikan trial, paket, dan kesehatan platform.</h1>
            <p>Semua tindakan sensitif memerlukan alasan, konfirmasi, dan tersimpan di audit log.</p>
          </div>
          <form className="developer-lifecycle-action" action={runTrialLifecycleAction}>
            <label><input name="confirmed" type="checkbox" value="yes" required /> Jalankan pemeriksaan sekarang</label>
            <button className="primary-button" type="submit"><Clock3 size={17} /> Jalankan trial lifecycle</button>
          </form>
        </section>

        {params.saved ? <div className="developer-alert success" role="status"><CheckCircle2 size={18} /><span>{params.saved}</span></div> : null}
        {params.error ? <div className="developer-alert danger" role="alert"><AlertTriangle size={18} /><span>{params.error}</span></div> : null}

        <section className="developer-metrics" aria-label="Ringkasan platform">
          <Metric icon={Users} label="Workspace" value={page.totalWorkspaces} detail={`${page.activeUsers} pengguna aktif 30 hari`} />
          <Metric icon={Clock3} label="Trial aktif" value={page.subscriptionCounts.TRIALING ?? 0} detail={`${page.expiringSoon} berakhir ≤7 hari`} />
          <Metric icon={CreditCard} label="Paket aktif" value={page.subscriptionCounts.ACTIVE ?? 0} detail={`${page.subscriptionCounts.PENDING_PAYMENT ?? 0} menunggu pembayaran`} />
          <Metric icon={Bot} label="AI request" value={page.aiUsage._sum.totalAiRequests ?? 0} detail={`${Math.round(page.aiUsage._avg.latencyMs ?? 0)} ms rata-rata`} />
        </section>

        <section className="developer-trial-card">
          <div className="developer-trial-copy">
            <div className="developer-icon-box"><Users size={22} /></div>
            <div>
              <p className="eyebrow">Kuota peluncuran</p>
              <h2>100 workspace pertama</h2>
              <p>Slot baru diklaim setelah OTP email berhasil, jadi akun yang tidak terverifikasi tidak menghabiskan kuota.</p>
            </div>
          </div>
          <div className="developer-trial-progress">
            <div><strong>{page.trial.claimed}/100</strong><span>{page.trial.remaining} slot tersisa</span></div>
            <progress value={page.trial.claimed} max={page.trial.limit}>{page.trial.claimed}%</progress>
          </div>
        </section>

        <section className="developer-section" id="workspaces">
          <div className="developer-section-heading">
            <div><p className="eyebrow">Workspace</p><h2>Trial dan langganan</h2></div>
            <form className="developer-filter" method="get">
              <label><span className="sr-only">Cari workspace atau email</span><Search size={16} /><input name="q" defaultValue={params.q ?? ""} placeholder="Cari workspace atau email" /></label>
              <select name="status" defaultValue={params.status ?? ""} aria-label="Filter status paket">
                <option value="">Semua status</option>
                {Object.values(WorkspaceSubscriptionStatus).map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
              </select>
              <button className="secondary-button" type="submit">Terapkan</button>
            </form>
          </div>

          <div className="developer-table-wrap">
            <table className="developer-table">
              <thead><tr><th>Workspace</th><th>Paket</th><th>Operasional</th><th>Terakhir aktif</th><th>Aksi</th></tr></thead>
              <tbody>
                {page.workspaces.map((workspace) => {
                  const subscription = workspace.subscription;
                  return (
                    <tr key={workspace.id}>
                      <td><strong>{workspace.businessName}</strong><small>{workspace.user.name} · {workspace.user.email}</small><small>{workspace._count.memberships} anggota · {workspace._count.contacts} pelanggan</small></td>
                      <td>
                        <span className={`developer-status ${statusTone(subscription?.status)}`}>{subscription ? statusLabel(subscription.status) : "Legacy"}</span>
                        <small>{subscription?.plan ?? "BETA"}{subscription?.trialClaimNumber ? ` · trial #${subscription.trialClaimNumber}` : ""}</small>
                        <small>{subscription?.trialEndsAt ? `Trial sampai ${formatDate(subscription.trialEndsAt)}` : subscription?.currentPeriodEndsAt ? `Aktif sampai ${formatDate(subscription.currentPeriodEndsAt)}` : "—"}</small>
                      </td>
                      <td><small>AI {workspace.agentSettings?.isActive ? "aktif" : "mati"}</small><small>WA {workspace.whatsAppSettings?.isActive ? "live" : "belum"} · Telegram {workspace.telegramSettings?.isActive ? "live" : "belum"}</small><small>{workspace._count.conversations} percakapan</small></td>
                      <td>{formatDateTime(workspace.user.lastSeenAt ?? workspace.updatedAt)}</td>
                      <td>
                        <details className="developer-action-menu">
                          <summary>Kelola</summary>
                          <div className="developer-action-panel">
                            <section>
                              <h3>Aktifkan paket manual</h3>
                              <p>Gunakan setelah pembayaran manual benar-benar diterima.</p>
                              <form action={activateWorkspacePlanAction}>
                                <input type="hidden" name="businessId" value={workspace.id} />
                                <label>Paket<select name="plan" defaultValue={SubscriptionPlan.STARTER}>{[SubscriptionPlan.STARTER, SubscriptionPlan.GROWTH, SubscriptionPlan.BUSINESS].map((plan) => <option key={plan} value={plan}>{plan}</option>)}</select></label>
                                <label>Siklus<select name="billingCycle" defaultValue={SubscriptionBillingCycle.MONTHLY}><option value={SubscriptionBillingCycle.MONTHLY}>Bulanan</option><option value={SubscriptionBillingCycle.ANNUAL}>Tahunan</option></select></label>
                                <label>Masa aktif<select name="durationDays" defaultValue="30"><option value="30">30 hari</option><option value="90">90 hari</option><option value="365">365 hari</option></select></label>
                                <label>Alasan<input name="reason" minLength={8} maxLength={500} placeholder="Contoh: Transfer manual sudah diverifikasi" required /></label>
                                <ConfirmField />
                                <button className="primary-button" type="submit">Aktifkan paket</button>
                              </form>
                            </section>
                            {subscription?.trialClaimNumber ? (
                              <section>
                                <h3>Kelola trial</h3>
                                <form action={adjustWorkspaceTrialAction}>
                                  <input type="hidden" name="businessId" value={workspace.id} />
                                  <label>Tindakan<select name="operation" defaultValue="EXTEND"><option value="EXTEND">Perpanjang</option><option value="END">Akhiri sekarang</option></select></label>
                                  <label>Tambahan hari<input name="days" type="number" min="1" max="30" defaultValue="7" /></label>
                                  <label>Alasan<input name="reason" minLength={8} maxLength={500} required /></label>
                                  <ConfirmField />
                                  <button className="secondary-button" type="submit">Simpan trial</button>
                                </form>
                              </section>
                            ) : null}
                            {!workspace.user.isPlatformAdmin ? (
                              <section>
                                <h3>Keamanan akun</h3>
                                <form action={setDeveloperUserStatusAction}>
                                  <input type="hidden" name="userId" value={workspace.user.id} />
                                  <input type="hidden" name="status" value={workspace.user.status === UserStatus.SUSPENDED ? UserStatus.ACTIVE : UserStatus.SUSPENDED} />
                                  <ConfirmField />
                                  <button className="danger-button" type="submit">{workspace.user.status === UserStatus.SUSPENDED ? "Aktifkan akun" : "Suspend akun"}</button>
                                </form>
                              </section>
                            ) : null}
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="developer-two-column">
          <section className="developer-section">
            <div className="developer-section-heading"><div><p className="eyebrow">Pembayaran</p><h2>Transaksi terbaru</h2></div><CreditCard size={21} /></div>
            <div className="developer-compact-list">{page.payments.length ? page.payments.map((payment) => (
              <article key={payment.orderId}><div><strong>{payment.business.businessName}</strong><span>{payment.orderId}</span></div><div><strong>{formatIdr(Number(payment.amount))}</strong><span>{payment.plan} · {statusLabel(payment.status)}</span></div></article>
            )) : <Empty icon={CreditCard} text="Belum ada pembayaran paket." />}</div>
          </section>

          <section className="developer-section">
            <div className="developer-section-heading"><div><p className="eyebrow">Audit</p><h2>Perubahan platform</h2></div><History size={21} /></div>
            <div className="developer-compact-list">{page.audits.length ? page.audits.map((audit) => (
              <article key={audit.id}><div><strong>{auditActionLabel(audit.action)}</strong><span>{audit.business?.businessName ?? audit.targetId}</span></div><div><span>{audit.actor.name}</span><span>{formatDateTime(audit.createdAt)}</span></div>{audit.reason ? <p>{audit.reason}</p> : null}</article>
            )) : <Empty icon={History} text="Belum ada tindakan developer." />}</div>
          </section>
        </div>

        <section className="developer-section">
          <div className="developer-section-heading"><div><p className="eyebrow">Reliability</p><h2>Antrean gagal</h2></div><Database size={21} /></div>
          {page.failedJobs.length ? <div className="developer-job-grid">{page.failedJobs.map((job) => (
            <article key={job.id}><AlertTriangle size={18} /><div><strong>{job.type}</strong><span>{job.business.businessName} · {job.attempts}/{job.maxAttempts} percobaan</span><p>{job.lastError ?? "Error tidak diketahui"}</p></div><form action={replayDeveloperJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="secondary-button" type="submit">Ulangi</button></form></article>
          ))}</div> : <Empty icon={CheckCircle2} text="Antrean bersih. Tidak ada job gagal." />}
        </section>
      </div>
    </main>
  );
}

function DeveloperAccessDenied() {
  return (
    <main className="developer-page">
      <header className="developer-header">
        <div className="developer-brand">
          <AijouLogo size={38} />
          <div><strong>Aijou Developer</strong><span>Platform operations</span></div>
        </div>
        <Link className="secondary-button" href="/dashboard"><ArrowLeft size={16} /> Kembali ke workspace</Link>
      </header>
      <section className="developer-access-denied">
        <div className="developer-icon-box"><ShieldCheck size={21} /></div>
        <p className="eyebrow">Akses terbatas</p>
        <h1>Akun ini adalah owner workspace, bukan pengelola platform.</h1>
        <p>Developer console hanya tersedia untuk akun internal Aijou yang diberi akses platform secara khusus.</p>
        <Link className="primary-button" href="/dashboard">Buka workspace</Link>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: number; detail: string }) {
  return <article><div className="developer-icon-box"><Icon size={19} /></div><span>{label}</span><strong>{new Intl.NumberFormat("id-ID").format(value)}</strong><small>{detail}</small></article>;
}

function ConfirmField() {
  return <label className="developer-confirm"><input name="confirmed" type="checkbox" value="yes" required /><span>Saya sudah memeriksa data dan memahami dampaknya.</span></label>;
}

function Empty({ icon: Icon, text }: { icon: typeof Activity; text: string }) {
  return <div className="developer-empty"><Icon size={20} /><span>{text}</span></div>;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING_ACTIVATION: "Menunggu verifikasi",
    TRIALING: "Trial aktif",
    PENDING_PAYMENT: "Menunggu pembayaran",
    ACTIVE: "Aktif",
    PAST_DUE: "Pembayaran bermasalah",
    CANCELED: "Dibatalkan",
    EXPIRED: "Berakhir",
    PENDING: "Menunggu",
    SETTLED: "Berhasil",
    FAILED: "Gagal",
    REFUNDED: "Refund",
    CHARGEBACK: "Chargeback",
  };
  return labels[status] ?? status;
}

function statusTone(status?: WorkspaceSubscriptionStatus) {
  if (status === WorkspaceSubscriptionStatus.ACTIVE || status === WorkspaceSubscriptionStatus.TRIALING) return "success";
  if (status === WorkspaceSubscriptionStatus.PENDING_PAYMENT || status === WorkspaceSubscriptionStatus.PENDING_ACTIVATION) return "warning";
  return "danger";
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    subscription_manually_activated: "Paket diaktifkan manual",
    trial_extended: "Trial diperpanjang",
    trial_ended_manually: "Trial diakhiri",
    user_suspended: "Akun ditangguhkan",
    user_reactivated: "Akun diaktifkan",
    background_job_replayed: "Job diulang manual",
    trial_lifecycle_run_manually: "Lifecycle trial dijalankan",
  };
  return labels[action] ?? action.replaceAll("_", " ");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Makassar" }).format(value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(value);
}
