import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, MessageCircle, UserRoundCheck } from "lucide-react";
import { AijouLogo } from "@/components/aijou-logo";
import { getSession } from "@/lib/session";
import { inspectBetaInvite } from "@/server/auth/beta-invites";
import {
  isPublicSignupEnabled,
  isPublicSignupReady,
} from "@/server/auth/public-signup-validation";
import { isTransactionalEmailConfigured } from "@/server/email";
import { SignupForm } from "@/app/signup/signup-form";
import {
  formatIdr,
  getPlanPrice,
  getSubscriptionPlan,
  normalizeBillingCycle,
  normalizePublicPlanId,
} from "@/lib/subscription-plans";

export const metadata: Metadata = {
  title: "Daftar beta | Aijou AI",
  description: "Buat workspace Aijou untuk mengelola chat, follow-up, dan human takeover dari satu tempat.",
};

type SignupPageProps = {
  searchParams: Promise<{ token?: string; plan?: string; billing?: string }>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  if (await getSession()) redirect("/dashboard");

  const { token = "", plan: planParam, billing: billingParam } = await searchParams;
  const selectedPlan = normalizePublicPlanId(planParam);
  const selectedBilling = normalizeBillingCycle(billingParam);
  const selectedPlanDefinition = getSubscriptionPlan(selectedPlan)!;
  const invite = token ? await inspectBetaInvite(token) : null;
  const publicSignupEnabled = isPublicSignupEnabled();
  const publicSignupReady = isPublicSignupReady(isTransactionalEmailConfigured());
  const canSignup = Boolean(invite) || publicSignupReady;
  const isInvite = Boolean(invite);

  return (
    <main className="page login-page auth-page signup-page">
      <div className="login-shell">
        <section className="login-hero-card auth-story-card">
          <Link className="auth-home-link" href="/" aria-label="Kembali ke beranda Aijou">
            <AijouLogo className="login-brand-mark" size={40} />
            <span>Aijou AI</span>
          </Link>

          <div className="auth-story-copy">
            <p className="eyebrow">Workspace bisnis percakapan</p>
            <h1>Biar chat masuk tidak berhenti jadi notifikasi.</h1>
            <p>
              Aijou membantu tim memahami kebutuhan, menjaga konteks, dan menuntaskan
              percakapan tanpa mengambil kendali dari manusia.
            </p>
          </div>

          <div className="auth-value-list" aria-label="Manfaat Aijou">
            <span>
              <MessageCircle size={18} aria-hidden="true" />
              AI menjawab memakai konteks bisnismu
            </span>
            <span>
              <UserRoundCheck size={18} aria-hidden="true" />
              Tim bisa mengambil alih kapan saja
            </span>
            <span>
              <CheckCircle2 size={18} aria-hidden="true" />
              Lead dan tindak lanjut tetap terlihat jelas
            </span>
          </div>

          <p className="auth-channel-note">
            Web Live Chat dan Telegram siap dipakai. WhatsApp dapat disambungkan setelah
            verifikasi Meta selesai.
          </p>
        </section>

        <section className="login-panel auth-form-panel">
          <div className="auth-panel-heading">
            <p className="eyebrow">{isInvite ? "Undangan beta" : "Daftar Aijou"}</p>
            <h2>{isInvite ? "Aktifkan workspace-mu." : "Buat workspace pertamamu."}</h2>
            <p className="muted">
              {isInvite
                ? "Selesaikan data owner untuk menerima undangan ini."
                : selectedPlanDefinition.trialDays
                  ? "Tidak perlu kartu kredit. Masukkan OTP dari email untuk memulai trial."
                  : "Masukkan OTP dari email, lalu selesaikan pembayaran untuk mengaktifkan paket."}
            </p>
          </div>

          {token && !invite ? (
            <div className="settings-note" role="status">
              <strong>Link undangan sudah tidak aktif</strong>
              <p>
                {publicSignupReady
                  ? "Tidak masalah, kamu tetap bisa membuat workspace beta baru di bawah."
                  : publicSignupEnabled
                    ? "Layanan verifikasi email belum siap. Minta undangan baru atau coba lagi nanti."
                    : "Minta link baru kepada pengirim undangan atau kembali ke halaman masuk."}
              </p>
            </div>
          ) : null}

          {canSignup ? (
            <>
              {!isInvite ? (
                <div className="settings-note signup-plan-summary" role="status">
                  <strong>{selectedPlanDefinition.name} · {selectedBilling === "annual" ? "Tahunan" : "Bulanan"}</strong>
                  <p>
                    {selectedPlanDefinition.trialDays
                      ? `Coba gratis ${selectedPlanDefinition.trialDays} hari. `
                      : "Paket aktif setelah pembayaran terverifikasi. "}
                    Setelahnya {formatIdr(getPlanPrice(selectedPlan, selectedBilling))}
                    {selectedBilling === "annual" ? "/tahun" : "/bulan"}.
                  </p>
                  <Link href="/#pricing">Ubah pilihan paket</Link>
                </div>
              ) : null}
              <SignupForm
                mode={isInvite ? "invite" : "public"}
                token={isInvite ? token : undefined}
                email={invite?.email}
                businessName={invite?.businessName}
                plan={selectedPlan}
                billingCycle={selectedBilling}
              />
            </>
          ) : (
            <div className="settings-note" role="status">
              <strong>
                {publicSignupEnabled
                  ? "Pendaftaran publik sementara belum siap"
                  : "Pendaftaran publik sedang ditutup"}
              </strong>
              <p>
                {publicSignupEnabled
                  ? "Layanan email verifikasi belum tersedia. Coba lagi nanti atau gunakan undangan beta."
                  : "Jika sudah menerima undangan, buka kembali link lengkap dari Aijou."}
              </p>
            </div>
          )}

          <p className="auth-switch-copy">
            Sudah punya workspace? <Link href="/login">Masuk ke Aijou</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
