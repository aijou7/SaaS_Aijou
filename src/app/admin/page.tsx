import { Activity, AlertTriangle, CheckCircle2, MailCheck, Users } from "lucide-react";
import { redirect } from "next/navigation";
import {
  replayFailedJobAction,
  setUserStatusAction,
  updateFeedbackAction,
} from "@/app/admin/actions";
import { AppShell } from "@/components/app-shell";
import { FeedbackStatus, UserStatus } from "@/generated/prisma-beta/client";
import { getSession } from "@/lib/session";
import { getAdminCockpit } from "@/server/admin-cockpit";
import { feedbackCategoryLabels } from "@/server/feedback";

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  let page: Awaited<ReturnType<typeof getAdminCockpit>>;
  try {
    page = await getAdminCockpit(session.userId);
  } catch {
    redirect("/dashboard");
  }

  return (
    <AppShell active="admin" businessName="Aijou Platform">
      <section className="hero compact-hero">
        <p className="eyebrow">Beta cockpit</p>
        <h1>Lihat siapa yang aktif, di mana mereka macet, dan apa yang gagal.</h1>
        <p>Cockpit operasional lintas workspace untuk tester, feedback, antrean, dan biaya AI.</p>
      </section>

      <section className="grid" aria-label="Platform metrics">
        <Metric icon={<Users size={22} />} label="Tester" value={String(page.totalUsers)} detail={`${page.activeUsers} aktif 30 hari`} />
        <Metric icon={<Activity size={22} />} label="AI request 30 hari" value={String(page.usage._sum.totalAiRequests ?? 0)} detail={`${Math.round(page.usage._avg.latencyMs ?? 0)} ms rata-rata`} />
        <Metric icon={<AlertTriangle size={22} />} label="Queue" value={String(page.pendingJobs)} detail={`${page.failedJobs.length} dead-letter`} />
        <Metric icon={<MailCheck size={22} />} label="Email" value={page.emailConfigured ? "Ready" : "Setup"} detail="Resend transactional" />
      </section>

      <section className="section">
        <div className="section-title-row"><div><p className="eyebrow">Tester lifecycle</p><h2>Akun & activation</h2></div><span className="status">{page.users.length} terbaru</span></div>
        <div className="table-wrap"><table><thead><tr><th>Tester</th><th>Workspace</th><th>Activation</th><th>Last seen</th><th>Status</th><th>Aksi</th></tr></thead><tbody>
          {page.users.map((user) => {
            const business = user.businesses[0];
            const eventTypes = new Set(business?.activationEvents.map((event) => event.type) ?? []);
            return <tr key={user.id}>
              <td><strong>{user.name}</strong><small>{user.email}<br />{user.signupSource} · {user.emailVerifiedAt ? "verified" : "unverified"}</small></td>
              <td>{business?.businessName ?? "—"}<small>{business ? `${business._count.conversations} chat · ${business._count.memberships} member` : "Belum ada workspace"}</small></td>
              <td>{business?.onboardingCompleted ? "Onboarding done" : `${eventTypes.size} milestone`}<small>{business?.agentSettings?.isActive ? "AI live" : "AI off"} · {business?.widgetLastSeenAt ? "Web detected" : "Web pending"}</small></td>
              <td>{formatDate(user.lastSeenAt ?? user.lastLoginAt ?? user.createdAt)}</td>
              <td><span className={user.status === "ACTIVE" ? "status" : "status status-warning"}>{user.status}</span></td>
              <td>{user.isPlatformAdmin ? <small>Protected</small> : <form action={setUserStatusAction}><input type="hidden" name="userId" value={user.id} /><input type="hidden" name="status" value={user.status === UserStatus.SUSPENDED ? UserStatus.ACTIVE : UserStatus.SUSPENDED} /><button className="ghost-button" type="submit">{user.status === UserStatus.SUSPENDED ? "Aktifkan" : "Suspend"}</button></form>}</td>
            </tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="section split-layout">
        <div className="card">
          <div className="section-title-row"><div><p className="eyebrow">Feedback</p><h2>{page.feedback.length} laporan</h2></div><CheckCircle2 size={22} /></div>
          <div className="stack-list">{page.feedback.slice(0, 40).map((item) => (
            <form className="settings-note" action={updateFeedbackAction} key={item.id}>
              <input type="hidden" name="feedbackId" value={item.id} />
              <strong>{item.title}</strong><small>{item.business.businessName} · {item.submittedBy.email} · {feedbackCategoryLabels[item.category]}</small>
              <p>{item.message}</p>
              <textarea name="response" defaultValue={item.adminResponse ?? ""} placeholder="Balasan untuk tester" maxLength={4000} />
              <div className="quick-actions"><select name="status" defaultValue={item.status}>{Object.values(FeedbackStatus).map((status) => <option value={status} key={status}>{status}</option>)}</select><button className="ghost-button" type="submit">Simpan</button></div>
            </form>
          ))}</div>
        </div>

        <div className="card">
          <div className="section-title-row"><div><p className="eyebrow">Dead letter queue</p><h2>{page.failedJobs.length} job gagal</h2></div><AlertTriangle size={22} /></div>
          <div className="stack-list">{page.failedJobs.length ? page.failedJobs.map((job) => (
            <article className="settings-note" key={job.id}><strong>{job.type}</strong><small>{job.business.businessName} · attempt {job.attempts}/{job.maxAttempts} · {formatDate(job.updatedAt)}</small><p>{job.lastError ?? "Unknown error"}</p><form action={replayFailedJobAction}><input type="hidden" name="jobId" value={job.id} /><button className="ghost-button" type="submit">Replay job</button></form></article>
          )) : <div className="empty-state"><CheckCircle2 size={24} /><strong>Queue bersih</strong><p>Tidak ada job yang masuk dead-letter.</p></div>}</div>
        </div>
      </section>
    </AppShell>
  );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return <div className="card">{icon}<h2>{label}</h2><div className="metric">{value}</div><p className="muted">{detail}</p></div>;
}

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(value) : "Belum pernah";
}
