import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { ForgotPasswordForm } from "@/app/forgot-password/forgot-password-form";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Lupa password",
  description: "Minta link sekali pakai untuk membuat password Aijou AI yang baru.",
};

export default async function ForgotPasswordPage() {
  if (await getSession()) redirect("/account");

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
            <h1>Balik masuk tanpa mengorbankan keamanan.</h1>
            <p>
              Kami mengirim link sekali pakai ke email akunmu. Password lama tidak pernah
              dikirim atau ditampilkan kembali.
            </p>
          </div>
          <div className="login-feature-grid">
            <span><KeyRound size={17} aria-hidden="true" /> Link berlaku 60 menit</span>
            <span><LockKeyhole size={17} aria-hidden="true" /> Hanya dapat dipakai sekali</span>
            <span><ShieldCheck size={17} aria-hidden="true" /> Sesi lama dicabut setelah reset</span>
          </div>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Lupa password</p>
            <h2>Minta link reset.</h2>
            <p className="muted">
              Masukkan email yang biasa kamu gunakan untuk masuk ke workspace.
            </p>
          </div>
          <ForgotPasswordForm />
          <p className="auth-switch-copy">
            Sudah ingat password? <Link href="/login">Kembali masuk</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
