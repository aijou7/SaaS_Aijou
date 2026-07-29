import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, KeyRound, MailCheck } from "lucide-react";
import { AuthTokenPurpose } from "@/generated/prisma-beta/client";
import { VerifyEmailForm } from "@/app/verify-email/verify-email-form";
import { VerifyEmailOtpForm } from "@/app/verify-email/verify-email-otp-form";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";
import { getOtpChallengeInfo } from "@/server/auth/account-lifecycle";

export const metadata: Metadata = {
  title: "Verifikasi email",
  description: "Konfirmasi alamat email akun Aijou AI.",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    challenge?: string;
    token?: string;
    success?: string;
    sent?: string;
    resent?: string;
    error?: string;
  }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  const token = params.token?.trim() ?? "";
  const challengeId = params.challenge?.trim() ?? "";
  const hasPlausibleToken = /^[A-Za-z0-9_-]{40,128}$/.test(token);
  const challenge = /^[A-Za-z0-9_-]{32}$/.test(challengeId)
    ? await getOtpChallengeInfo(challengeId, AuthTokenPurpose.EMAIL_VERIFICATION)
    : null;
  const verified = params.success === "1";
  const sent = params.sent === "1" || params.resent === "1";

  return (
    <main className="page login-page auth-page auth-compact-page">
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/" aria-label="Kembali ke beranda Aijou">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">Keamanan identitas</p>
            <h1>Pastikan recovery kembali ke orang yang tepat.</h1>
            <p>
              Email terverifikasi membuat pemulihan akun dan notifikasi penting workspace
              memiliki tujuan yang jelas.
            </p>
          </div>
          <div className="login-feature-grid">
            <span><MailCheck size={17} aria-hidden="true" /> Alamat email terkonfirmasi</span>
            <span><KeyRound size={17} aria-hidden="true" /> Recovery akun lebih aman</span>
            <span><BadgeCheck size={17} aria-hidden="true" /> Status terlihat di halaman Account</span>
          </div>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Verifikasi email</p>
            <h2>
              {verified
                ? "Email dan password sudah siap."
                : challenge
                  ? "Masukkan kode dari email."
                  : "Konfirmasi identitas dan password."}
            </h2>
            <p className="muted">
              {verified
                ? "Link sudah diproses dan tidak dapat dipakai kembali."
                : challenge
                  ? "Enam digit untuk memastikan alamat email ini benar-benar dapat kamu akses."
                  : "Tetapkan password final saat memakai link sekali pakai ini."}
            </p>
          </div>

          {params.error ? (
            <div className="settings-note" role="alert">
              <strong>OTP belum dapat dikirim</strong>
              <p>{formatOtpPageError(params.error)}</p>
            </div>
          ) : null}

          {verified ? (
            <div className="settings-note" role="status">
              <strong>Verifikasi berhasil</strong>
              <p>Kamu bisa melanjutkan ke workspace dengan aman.</p>
            </div>
          ) : challenge ? (
            <>
              {sent ? (
                <div className="settings-note" role="status">
                  <strong>{params.resent === "1" ? "OTP baru sudah dikirim" : "OTP sudah dikirim"}</strong>
                  <p>Periksa inbox, Promotions, atau Spam lalu masukkan kode terbaru.</p>
                </div>
              ) : null}
              <VerifyEmailOtpForm
                challengeId={challengeId}
                maskedEmail={challenge.maskedEmail}
              />
            </>
          ) : hasPlausibleToken ? (
            <VerifyEmailForm token={token} />
          ) : (
            <div className="settings-note" role="alert">
              <strong>Link verifikasi tidak dapat digunakan</strong>
              <p>Minta link baru lewat alur recovery akun jika link lama sudah kedaluwarsa.</p>
            </div>
          )}

          <p className="auth-switch-copy">
            {session ? (
              <Link href="/account">Kembali ke Account</Link>
            ) : (
              <Link href="/login">Masuk ke Aijou</Link>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}

function formatOtpPageError(error: string) {
  if (error === "rate") return "Terlalu sering meminta kode. Tunggu sebentar lalu coba lagi.";
  if (error === "delivery") return "Layanan email sedang tidak tersedia. Coba lagi sebentar.";
  return "Sesi verifikasi sudah tidak berlaku. Ulangi pendaftaran untuk meminta kode baru.";
}
