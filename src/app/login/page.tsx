import { redirect } from "next/navigation";
import { CheckCircle2, MessageCircle, WalletCards } from "lucide-react";
import { getSession } from "@/lib/session";
import { AijouLogo } from "@/components/aijou-logo";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; passwordChanged?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  return (
    <main className="page login-page">
      <div className="login-shell">
        <section className="login-hero-card">
          <AijouLogo className="login-brand-mark" size={40} />
          <p className="eyebrow">Aijou AI workspace</p>
          <h1>Aijou AI</h1>
          <p>
            AI sales agent untuk menjawab chat, mendorong closing, dan menjaga tim Anda
            tetap memegang kendali.
          </p>
          <div className="login-feature-grid">
            <span>
              <WalletCards size={17} aria-hidden="true" />
              Percakapan terarah
            </span>
            <span>
              <MessageCircle size={17} aria-hidden="true" />
              AI yang belajar bisnis
            </span>
            <span>
              <CheckCircle2 size={17} aria-hidden="true" />
              Kendali tetap di tim
            </span>
          </div>
        </section>

        <section className="login-panel">
          <div>
            <p className="eyebrow">Masuk ke Aijou</p>
            <h2>Lanjutkan percakapan yang penting.</h2>
            <p className="muted">Gunakan akun owner yang dibuat dari seed database lokal.</p>
          </div>
          {params.passwordChanged === "1" ? (
            <div className="settings-note" role="status">
              <strong>Password berhasil diubah</strong>
              <p>Semua sesi lama sudah dicabut. Silakan masuk dengan password baru.</p>
            </div>
          ) : null}
          {params.error ? (
            <div className="settings-note" role="alert">
              <strong>Belum berhasil masuk</strong>
              <p>{formatLoginError(params.error)}</p>
            </div>
          ) : null}
          <form className="login-form" action="/api/auth/login" method="post">
            <label>
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" required />
            </label>
            <button type="submit">Masuk</button>
          </form>
        </section>
      </div>
    </main>
  );
}

function formatLoginError(value: string) {
  const messages: Record<string, string> = {
    invalid_credentials: "Email atau password salah. Periksa kembali lalu coba lagi.",
    invalid_request: "Permintaan login tidak valid. Muat ulang halaman lalu coba lagi.",
    rate_limited: "Terlalu banyak percobaan login. Tunggu sebentar lalu coba lagi.",
  };

  return messages[value] ?? "Login belum berhasil. Silakan coba lagi.";
}
