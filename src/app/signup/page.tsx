import Link from "next/link";
import { redirect } from "next/navigation";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";
import { inspectBetaInvite } from "@/server/auth/beta-invites";
import { SignupForm } from "@/app/signup/signup-form";

type SignupPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  if (await getSession()) redirect("/dashboard");
  const { token = "" } = await searchParams;
  const invite = token ? await inspectBetaInvite(token) : null;

  return (
    <main className="page login-page">
      <div className="login-shell">
        <section className="login-hero-card">
          <AijouLogo className="login-brand-mark" size={40} />
          <p className="eyebrow">Aijou AI private beta</p>
          <h1>Workspace milikmu sendiri.</h1>
          <p>Agent, knowledge, chat, lead, proposal, order, dan integration terisolasi per bisnis.</p>
        </section>
        <section className="login-panel">
          <div>
            <p className="eyebrow">Aktivasi invite</p>
            <h2>{invite ? "Buat akun beta" : "Invite tidak valid"}</h2>
          </div>
          {invite ? (
            <SignupForm token={token} email={invite.email} businessName={invite.businessName} />
          ) : (
            <div className="settings-note">
              Link invite tidak ada, sudah dipakai, atau kedaluwarsa.
              <Link href="/login">Kembali ke login</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
