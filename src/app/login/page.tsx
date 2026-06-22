import { redirect } from "next/navigation";
import { CheckCircle2, MessageCircle, WalletCards } from "lucide-react";
import { getSession } from "@/lib/session";
import { AijouLogo } from "@/components/aijou-logo";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

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
