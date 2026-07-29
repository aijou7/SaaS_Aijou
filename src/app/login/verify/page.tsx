import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound, Laptop2, ShieldCheck } from "lucide-react";
import { AuthTokenPurpose } from "@/generated/prisma-beta/client";
import { AijouLogo } from "@/components/aijou-logo";
import { getSafeInternalRedirectPath } from "@/lib/safe-navigation";
import { getSession } from "@/lib/session";
import { getOtpChallengeInfo } from "@/server/auth/account-lifecycle";
import { LoginOtpForm } from "@/app/login/verify/login-otp-form";

export const metadata: Metadata = {
  title: "Konfirmasi login | Aijou AI",
  description: "Konfirmasi perangkat baru dengan kode keamanan Aijou AI.",
};

export default async function LoginVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{
    challenge?: string;
    next?: string;
    resent?: string;
  }>;
}) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const nextPath = getSafeInternalRedirectPath(params.next);
  if (session) redirect(nextPath ?? "/dashboard");

  const challengeId = params.challenge?.trim() ?? "";
  const challenge = /^[A-Za-z0-9_-]{32}$/.test(challengeId)
    ? await getOtpChallengeInfo(challengeId, AuthTokenPurpose.LOGIN_OTP)
    : null;

  return (
    <main className="page login-page auth-page auth-compact-page">
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/" aria-label="Kembali ke beranda Aijou">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">Perangkat baru</p>
            <h1>Satu langkah sebelum membuka workspace.</h1>
            <p>
              Kode email memastikan password yang benar tidak dipakai dari perangkat asing.
            </p>
          </div>
          <div className="login-feature-grid">
            <span><KeyRound size={17} aria-hidden="true" /> Kode sekali pakai</span>
            <span><Laptop2 size={17} aria-hidden="true" /> Perangkat dapat dipercaya</span>
            <span><ShieldCheck size={17} aria-hidden="true" /> Password tetap terlindungi</span>
          </div>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Konfirmasi login</p>
            <h2>{challenge ? "Periksa email kamu." : "Sesi login berakhir."}</h2>
            <p className="muted">
              {challenge
                ? "Masukkan enam digit terbaru. Kode sebelumnya otomatis tidak berlaku setelah resend."
                : "Kembali ke halaman login untuk meminta kode baru."}
            </p>
          </div>

          {params.resent === "1" && challenge ? (
            <div className="settings-note" role="status">
              <strong>OTP baru sudah dikirim</strong>
              <p>Gunakan kode terbaru yang masuk ke inbox.</p>
            </div>
          ) : null}

          {challenge ? (
            <LoginOtpForm
              challengeId={challengeId}
              maskedEmail={challenge.maskedEmail}
              nextPath={nextPath}
            />
          ) : (
            <Link className="primary-button" href="/login">
              Kembali ke login
            </Link>
          )}
        </section>
      </div>
    </main>
  );
}
