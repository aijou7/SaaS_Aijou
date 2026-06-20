import { redirect } from "next/navigation";
import { Bot, CheckCircle2, MessageCircle, WalletCards } from "lucide-react";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="page login-page">
      <div className="login-shell">
        <section className="login-hero-card">
          <div className="brand-mark">
            <Bot size={20} aria-hidden="true" />
          </div>
          <p className="eyebrow">Owner workspace</p>
          <h1>WhatsApp AI Assistant</h1>
          <p>
            Satu cockpit untuk expense, receipt review, customer chat, human takeover,
            dan lead summary.
          </p>
          <div className="login-feature-grid">
            <span>
              <WalletCards size={17} aria-hidden="true" />
              Finance assistant
            </span>
            <span>
              <MessageCircle size={17} aria-hidden="true" />
              AI CS inbox
            </span>
            <span>
              <CheckCircle2 size={17} aria-hidden="true" />
              Local MVP ready
            </span>
          </div>
        </section>

        <section className="login-panel">
          <div>
            <p className="eyebrow">Login dashboard</p>
            <h2>Masuk ke workspace</h2>
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
