import type { Metadata } from "next";
import { BadgeCheck, ShieldCheck, UserRoundPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";
import { isTeamManagementEnabled } from "@/lib/team-feature";
import { formatWorkspaceRole, inspectTeamInvite } from "@/server/team-access";
import {
  InviteTokenCleaner,
  TeamAcceptForm,
} from "@/app/team/accept/team-accept-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Undangan tim | Aijou AI",
  description: "Terima undangan untuk bergabung ke workspace Aijou.",
  referrer: "no-referrer",
  robots: { index: false, follow: false, nocache: true },
};

type TeamAcceptPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function TeamAcceptPage({ searchParams }: TeamAcceptPageProps) {
  if (!isTeamManagementEnabled()) notFound();

  const [params, session] = await Promise.all([searchParams, getSession()]);
  const token = typeof params.token === "string" ? params.token : "";
  const invite = token ? await inspectTeamInvite(token) : null;

  if (!invite) return <InvalidInvitePage />;

  const sessionMatches = session?.email.toLowerCase() === invite.email.toLowerCase();
  const nextPath = `/team/accept?token=${encodeURIComponent(token)}`;
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <main className="page login-page auth-page signup-page">
      <InviteTokenCleaner />
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/" aria-label="Kembali ke beranda Aijou">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">Undangan workspace</p>
            <h1>Bekerja bersama tanpa berbagi akun.</h1>
            <p>
              Kamu diundang ke <strong>{invite.businessName}</strong>. Keanggotaan dan role akan
              dicatat untuk fitur kolaborasi yang sudah diaktifkan di workspace tersebut.
            </p>
          </div>
          <div className="auth-value-list" aria-label="Detail undangan">
            <span><UserRoundPlus size={18} aria-hidden="true" />{invite.email}</span>
            <span><ShieldCheck size={18} aria-hidden="true" />Role {formatWorkspaceRole(invite.role)}</span>
            <span><BadgeCheck size={18} aria-hidden="true" />Diundang oleh {invite.inviterName}</span>
          </div>
          <p className="auth-channel-note">
            Link berlaku sampai {formatDate(invite.expiresAt)} dan hanya dapat digunakan sekali.
          </p>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Bergabung ke tim</p>
            <h2>{invite.businessName}</h2>
            <p className="muted">
              Undangan ditujukan ke {invite.email} sebagai {formatWorkspaceRole(invite.role)}.
            </p>
          </div>

          {session && sessionMatches ? (
            <>
              <div className="settings-note" role="status">
                <strong>Akun sudah cocok</strong>
                <p>Kamu masuk sebagai {session.email}. Terima untuk menghubungkan workspace.</p>
              </div>
              <TeamAcceptForm mode="existing" token={token} />
            </>
          ) : session ? (
            <>
              <div className="settings-note" role="alert">
                <strong>Email akun tidak cocok</strong>
                <p>
                  Kamu masuk sebagai {session.email}, sedangkan undangan ditujukan ke {invite.email}.
                  Keluar, lalu buka kembali link undangan dengan akun yang sesuai.
                </p>
              </div>
              <form action="/api/auth/logout" method="post">
                <button className="ghost-button" type="submit">Keluar dari akun ini</button>
              </form>
            </>
          ) : invite.existingAccount ? (
            <>
              <div className="settings-note" role="status">
                <strong>Akun sudah tersedia</strong>
                <p>Masuk dengan {invite.email}, lalu kamu akan kembali ke undangan ini.</p>
              </div>
              <Link className="primary-button" href={loginHref}>Masuk dan lanjutkan</Link>
            </>
          ) : (
            <>
              <div className="settings-note" role="status">
                <strong>Buat akun anggota</strong>
                <p>Email sudah dikunci ke {invite.email}. Kamu hanya perlu nama dan password.</p>
              </div>
              <TeamAcceptForm mode="new" token={token} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function InvalidInvitePage() {
  return (
    <main className="page login-page auth-page">
      <InviteTokenCleaner />
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">Undangan workspace</p>
            <h1>Link ini sudah tidak aktif.</h1>
            <p>Undangan mungkin sudah dipakai, dicabut, kedaluwarsa, atau tidak lengkap.</p>
          </div>
        </section>
        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Perlu link baru</p>
            <h2>Minta admin mengirim ulang.</h2>
            <p className="muted">Untuk keamanan, setiap link tim hanya dapat dipakai sekali.</p>
          </div>
          <Link className="primary-button" href="/login">Masuk ke Aijou</Link>
        </section>
      </div>
    </main>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeStyle: "short" }).format(value);
}
