import { redirect } from "next/navigation";
import { CheckCircle2, MessageCircle, WalletCards } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { getSafeInternalRedirectPath } from "@/lib/safe-navigation";
import { AijouLogo } from "@/components/aijou-logo";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    passwordChanged?: string;
    deletionScheduled?: string;
    teamJoined?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [session, params] = await Promise.all([getSession(), searchParams]);
  const nextPath = getSafeInternalRedirectPath(params.next);

  if (session) {
    redirect(nextPath ?? "/dashboard");
  }

  return (
    <main className="page login-page auth-page">
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/" aria-label="Kembali ke beranda Aijou">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>
          <div className="auth-story-copy">
            <p className="eyebrow">Workspace bisnis percakapan</p>
            <h1>Kembali ke percakapan yang perlu dituntaskan.</h1>
            <p>
              Semua chat, lead, knowledge, proposal, dan pembayaran tetap rapi di satu tempat.
            </p>
          </div>
          <div className="login-feature-grid">
            <span>
              <WalletCards size={17} aria-hidden="true" />
              Follow-up terarah
            </span>
            <span>
              <MessageCircle size={17} aria-hidden="true" />
              Konteks bisnis tersimpan
            </span>
            <span>
              <CheckCircle2 size={17} aria-hidden="true" />
              Kendali tetap di tim
            </span>
          </div>
          <p className="auth-channel-note">
            Satu konteks untuk AI dan timmu, dari sapaan pertama sampai tindak lanjut.
          </p>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">Masuk ke Aijou</p>
            <h2>Selamat datang kembali.</h2>
            <p className="muted">Masukkan akun workspace Anda.</p>
          </div>
          {params.passwordChanged === "1" ? (
            <div className="settings-note" role="status">
              <strong>Password berhasil diubah</strong>
              <p>Semua sesi lama sudah dicabut. Silakan masuk dengan password baru.</p>
            </div>
          ) : null}
          {params.deletionScheduled === "1" ? (
            <div className="settings-note" role="status">
              <strong>Penghapusan akun dijadwalkan</strong>
              <p>Data akan ditahan selama 7 hari. Masuk kembali untuk membatalkan.</p>
            </div>
          ) : null}
          {params.teamJoined === "1" ? (
            <div className="settings-note" role="status">
              <strong>Undangan tim sudah diterima</strong>
              <p>Masuk dengan akun yang diundang untuk membuka workspace tim.</p>
            </div>
          ) : null}
          {params.error ? (
            <div className="settings-note" role="alert">
              <strong>Belum berhasil masuk</strong>
              <p>{formatLoginError(params.error)}</p>
            </div>
          ) : null}
          <form className="login-form" action="/api/auth/login" method="post">
            {nextPath ? <input name="next" type="hidden" value={nextPath} /> : null}
            <label>
              Email
              <input name="email" type="email" maxLength={254} autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" maxLength={128} autoComplete="current-password" required />
            </label>
            <Link className="auth-inline-link" href="/forgot-password">
              Lupa password?
            </Link>
            <button type="submit">Masuk</button>
          </form>
          <p className="auth-switch-copy">
            Belum punya workspace? <Link href="/signup">Daftar beta gratis</Link>
          </p>
        </section>
      </div>
    </main>
  );
}

function formatLoginError(value: string) {
  const messages: Record<string, string> = {
    email_unverified:
      "Email belum diverifikasi. Buka link terbaru di inbox, atau gunakan Lupa password untuk mengambil alih akun dengan aman.",
    invalid_credentials: "Email atau password salah. Periksa kembali lalu coba lagi.",
    invalid_request: "Permintaan login tidak valid. Muat ulang halaman lalu coba lagi.",
    rate_limited: "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.",
  };

  return messages[value] ?? "Login belum berhasil. Silakan coba lagi.";
}
