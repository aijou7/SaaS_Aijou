import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { AijouLogo } from "@/components/aijou-logo";

export const metadata: Metadata = {
  title: "Buat password baru",
  description: "Buat password baru dari link recovery Aijou AI yang aman.",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = (await searchParams).token?.trim() ?? "";
  const hasPlausibleToken = /^[A-Za-z0-9_-]{40,128}$/.test(token);

  return (
    <main className="page login-page auth-page auth-compact-page">
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/" aria-label="Kembali ke beranda Aijou">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">Recovery akun</p>
            <h1>Password baru, semua sesi lama berakhir.</h1>
            <p>
              Setelah reset berhasil, perangkat yang masih memakai password lama harus masuk
              kembali. Ini membantu menutup akses yang tidak lagi kamu kenali.
            </p>
          </div>
          <div className="login-feature-grid">
            <span><ShieldCheck size={17} aria-hidden="true" /> Token sekali pakai</span>
            <span><LockKeyhole size={17} aria-hidden="true" /> Link tidak disimpan di address bar</span>
            <span><KeyRound size={17} aria-hidden="true" /> Sesi lama otomatis dicabut</span>
          </div>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Password baru</p>
            <h2>Amankan akunmu.</h2>
            <p className="muted">Gunakan password unik yang tidak dipakai di layanan lain.</p>
          </div>
          {hasPlausibleToken ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="settings-note" role="alert">
              <strong>Link reset tidak dapat digunakan</strong>
              <p>Minta link baru. Link lama mungkin sudah dipakai atau melewati masa berlaku.</p>
            </div>
          )}
          <p className="auth-switch-copy">
            Butuh link baru? <Link href="/forgot-password">Kirim ulang instruksi</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
