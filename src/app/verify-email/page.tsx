import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, KeyRound, MailCheck } from "lucide-react";
import { VerifyEmailForm } from "@/app/verify-email/verify-email-form";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Verifikasi email",
  description: "Konfirmasi alamat email akun Aijou AI.",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string; success?: string; sent?: string }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  const token = params.token?.trim() ?? "";
  const hasPlausibleToken = /^[A-Za-z0-9_-]{40,128}$/.test(token);
  const verified = params.success === "1";
  const sent = params.sent === "1";

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
                : sent
                  ? "Buka email untuk melanjutkan."
                  : "Konfirmasi identitas dan password."}
            </h2>
            <p className="muted">
              {verified
                ? "Link sudah diproses dan tidak dapat dipakai kembali."
                : sent
                  ? "Kami mengirim link sekali pakai. Signup belum dapat dipakai untuk login sebelum langkah itu selesai."
                  : "Tetapkan password final saat memakai link sekali pakai ini."}
            </p>
          </div>

          {verified ? (
            <div className="settings-note" role="status">
              <strong>Verifikasi berhasil</strong>
              <p>Kamu bisa melanjutkan ke workspace dengan aman.</p>
            </div>
          ) : sent ? (
            <div className="settings-note" role="status">
              <strong>Email verifikasi sudah dikirim</strong>
              <p>Periksa inbox dan spam. Buka link terbaru untuk menetapkan password final.</p>
            </div>
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
