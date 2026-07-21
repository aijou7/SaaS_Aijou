import { Clock3, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { revokeTeamInviteAction } from "@/app/team/actions";
import { TeamInviteForm } from "@/app/team/team-invite-form";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { isTeamManagementEnabled } from "@/lib/team-feature";
import {
  canManageWorkspaceRole,
  type WorkspaceRoleValue,
} from "@/lib/team-invites";
import {
  formatWorkspaceRole,
  getTeamManagementPage,
} from "@/server/team-access";
import { getWorkspaceAccess } from "@/server/workspace-access";

type TeamPageProps = {
  searchParams: Promise<{ revoked?: string; error?: string }>;
};

export default async function TeamPage({ searchParams }: TeamPageProps) {
  if (!isTeamManagementEnabled()) notFound();

  const session = await getSession();
  if (!session) redirect("/login");

  const [access, params] = await Promise.all([
    getWorkspaceAccess(session.userId),
    searchParams,
  ]);
  if (!access) redirect("/setup");

  const managerRole = access.role as WorkspaceRoleValue;
  const canManageTeam = managerRole === "OWNER" || managerRole === "ADMIN";
  if (!canManageTeam) {
    return (
      <AppShell active="team" businessName={access.businessName}>
        <section className="hero compact-hero">
          <p className="eyebrow">Tim & akses</p>
          <h1>Akses pengelolaan tim dibatasi.</h1>
          <p>Hanya owner dan admin yang dapat melihat anggota serta mengirim undangan.</p>
        </section>
        <div className="settings-note" role="status">
          <strong>Role kamu: {formatWorkspaceRole(managerRole)}</strong>
          <p>Hubungi owner workspace jika kamu membutuhkan perubahan akses.</p>
        </div>
      </AppShell>
    );
  }

  const page = await getTeamManagementPage(session.userId);
  const now = new Date();
  const actionError = params.error?.slice(0, 300);
  const activeMembers = page.members.filter((member) => member.isActive).length;
  const pendingInvites = page.invites.filter((invite) => getInviteStatus(invite, now).key === "PENDING").length;

  return (
    <AppShell active="team" businessName={page.business.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Tim & akses</p>
        <h1>Undang tim tanpa berbagi akun owner.</h1>
        <p>
          Setiap anggota memakai akun sendiri. Role menyimpan batas akses dasar untuk fitur
          workspace yang sudah mendukung kolaborasi tim.
        </p>
      </section>

      {params.revoked === "1" ? (
        <div className="settings-note" role="status">
          <strong>Undangan dicabut</strong>
          <p>Link tersebut tidak dapat digunakan lagi.</p>
        </div>
      ) : null}
      {actionError ? (
        <div className="settings-note" role="alert">
          <strong>Tindakan belum berhasil</strong>
          <p>{actionError}</p>
        </div>
      ) : null}

      <section className="grid" aria-label="Ringkasan tim">
        <TeamMetric icon={<Users size={22} />} label="Anggota aktif" value={String(activeMembers)} />
        <TeamMetric icon={<Mail size={22} />} label="Invite menunggu" value={String(pendingInvites)} />
        <TeamMetric icon={<ShieldCheck size={22} />} label="Akses kamu" value={formatWorkspaceRole(managerRole)} />
      </section>

      <section className="section split-layout">
        <div className="card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Tambah anggota</p>
              <h2>Kirim undangan aman</h2>
            </div>
            <UserPlus size={24} aria-hidden="true" />
          </div>
          <p className="muted">
            Link hanya berlaku sekali selama 7 hari. Admin hanya dapat mengundang Agent dan Viewer.
            Akses tiap modul tetap mengikuti kesiapan fitur kolaborasi beta.
          </p>
          <TeamInviteForm managerRole={managerRole} />
        </div>

        <div className="card">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Panduan role</p>
              <h2>Berikan akses secukupnya</h2>
            </div>
            <ShieldCheck size={24} aria-hidden="true" />
          </div>
          <div className="checklist">
            <RoleGuide role="Admin" detail="Kelola undangan Agent atau Viewer pada fitur tim." />
            <RoleGuide role="Agent" detail="Role operasional untuk modul yang mendukung kolaborasi." />
            <RoleGuide role="Viewer" detail="Role baca untuk modul yang mendukung kolaborasi." />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Anggota workspace</p>
            <h2>{page.members.length} akun terhubung</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Anggota</th>
                <th>Role</th>
                <th>Status</th>
                <th>Terakhir aktif</th>
                <th>Bergabung</th>
              </tr>
            </thead>
            <tbody>
              {page.members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <strong>{member.user.name}</strong>
                    <small>{member.user.email}</small>
                  </td>
                  <td><span className="status">{formatWorkspaceRole(member.role)}</span></td>
                  <td>
                    <span className={member.isActive && member.user.status === "ACTIVE" ? "status" : "status status-warning"}>
                      {member.isActive ? member.user.status.replaceAll("_", " ") : "NONAKTIF"}
                    </span>
                  </td>
                  <td>{formatDate(member.user.lastSeenAt)}</td>
                  <td>{formatDate(member.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Riwayat undangan</p>
            <h2>{page.invites.length} invite terbaru</h2>
          </div>
          <Clock3 size={24} aria-hidden="true" />
        </div>
        {page.invites.length === 0 ? (
          <div className="empty-state">
            <Mail size={24} aria-hidden="true" />
            <strong>Belum ada undangan</strong>
            <p>Undangan baru akan muncul di sini beserta status pengirimannya.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Dibuat</th>
                  <th>Detail</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {page.invites.map((invite) => {
                  const status = getInviteStatus(invite, now);
                  const canRevoke = status.key === "PENDING" && canManageWorkspaceRole(
                    managerRole,
                    invite.role as WorkspaceRoleValue,
                  );

                  return (
                    <tr key={invite.id}>
                      <td><strong>{invite.email}</strong></td>
                      <td>{formatWorkspaceRole(invite.role)}</td>
                      <td><span className={status.className}>{status.label}</span></td>
                      <td>{formatDate(invite.createdAt)}</td>
                      <td>
                        {formatInviteDetail(invite, status.key)}
                      </td>
                      <td>
                        {canRevoke ? (
                          <form action={revokeTeamInviteAction}>
                            <input name="inviteId" type="hidden" value={invite.id} />
                            <button className="ghost-button" type="submit">Cabut</button>
                          </form>
                        ) : <small>—</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function TeamMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="card metric-card">{icon}<span>{label}</span><strong>{value}</strong></div>;
}

function RoleGuide({ role, detail }: { role: string; detail: string }) {
  return <div className="checklist-item"><span><strong>{role}</strong><small>{detail}</small></span></div>;
}

function getInviteStatus(
  invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date,
) {
  if (invite.acceptedAt) return { key: "ACCEPTED", label: "Diterima", className: "status" } as const;
  if (invite.revokedAt) return { key: "REVOKED", label: "Dicabut", className: "status status-warning" } as const;
  if (invite.expiresAt <= now) return { key: "EXPIRED", label: "Kedaluwarsa", className: "status status-warning" } as const;
  return { key: "PENDING", label: "Menunggu", className: "status" } as const;
}

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(value)
    : "Belum pernah";
}

function formatInviteDetail(
  invite: {
    acceptedBy: { name: string; email: string } | null;
    revokedAt: Date | null;
    expiresAt: Date;
  },
  status: "ACCEPTED" | "REVOKED" | "EXPIRED" | "PENDING",
) {
  if (invite.acceptedBy) return `Diterima ${invite.acceptedBy.name || invite.acceptedBy.email}`;
  if (status === "REVOKED") return `Dicabut ${formatDate(invite.revokedAt)}`;
  if (status === "EXPIRED") return `Berakhir ${formatDate(invite.expiresAt)}`;
  return `Berlaku sampai ${formatDate(invite.expiresAt)}`;
}
