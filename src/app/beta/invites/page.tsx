import { redirect } from "next/navigation";
import { InviteForm } from "@/app/beta/invites/invite-form";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBetaInvitesPage } from "@/server/auth/beta-invites";
import { getBusinessProfilePage } from "@/server/business/profile";

export default async function BetaInvitesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [invites, profile] = await Promise.all([
    getBetaInvitesPage(session.userId).catch(() => null),
    getBusinessProfilePage(session.userId),
  ]);
  if (!invites) redirect("/dashboard");

  return (
    <AppShell active="account" businessName={profile.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Private beta</p>
        <h1>Undang tester tanpa membagikan akun owner.</h1>
        <p>Setiap link hanya dapat dipakai sekali, punya masa berlaku, dan membuat workspace terpisah.</p>
      </section>
      <section className="section split-layout">
        <div className="card">
          <h2>Buat invite</h2>
          <InviteForm />
        </div>
        <div className="card">
          <h2>Riwayat invite</h2>
          <div className="checklist">
            {invites.length === 0 ? <p className="muted">Belum ada invite.</p> : invites.map((invite) => (
              <div className="checklist-item" key={invite.id}>
                <span>
                  <strong>{invite.email || invite.businessName || "Open invite"}</strong>
                  <small>Expired {invite.expiresAt.toISOString().slice(0, 10)}</small>
                </span>
                <span className={invite.usedAt ? "status" : "status status-warning"}>
                  {invite.usedAt ? "Used" : invite.expiresAt <= new Date() ? "Expired" : "Active"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
