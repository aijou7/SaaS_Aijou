import {
  BadgeCheck,
  CalendarClock,
  Check,
  Clock3,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { syncSubscriptionPaymentAction } from "@/app/subscription/actions";
import { SubscriptionCheckoutButton } from "@/app/subscription/checkout-button";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import {
  formatIdr,
  getAnnualMonthlyEquivalent,
  getAnnualSavings,
  getPlanPrice,
  normalizeBillingCycle,
  subscriptionPlans,
} from "@/lib/subscription-plans";
import { getSubscriptionPageData } from "@/server/subscriptions/billing";

type SubscriptionPageProps = {
  searchParams: Promise<{
    billing?: string;
    payment?: string;
    order_id?: string;
    synced?: string;
    error?: string;
    upgrade?: string;
  }>;
};

export default async function SubscriptionPage({ searchParams }: SubscriptionPageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  const [params, data] = await Promise.all([
    searchParams,
    getSubscriptionPageData(session.userId),
  ]);
  const billingCycle = normalizeBillingCycle(params.billing);
  const subscription = data.business.subscription;
  const isOwner = data.access.role === "OWNER";
  const currentPlan = subscription?.plan ?? "BETA";
  const status = subscription?.status ?? "ACTIVE";
  const callbackOrderId = /^[A-Za-z0-9_.~-]{1,50}$/.test(params.order_id ?? "")
    ? params.order_id!
    : "";

  return (
    <AppShell
      active="subscription"
      businessName={data.business.businessName}
      workspaceRole={session.role ?? "VIEWER"}
    >
      <section className="subscription-page core-page">
        <div className="core-hero subscription-hero">
          <div>
            <p className="eyebrow">Paket & tagihan</p>
            <h1>Kapasitas yang jelas, tanpa mengganggu chat yang sedang berjalan.</h1>
            <p>
              Paket menempel ke workspace. Semua anggota memakai akses yang sama dan
              aktivasi pembayaran hanya diproses setelah Midtrans memverifikasi transaksi.
            </p>
          </div>
          <div className="subscription-current-card" aria-label="Paket saat ini">
            <BadgeCheck size={20} aria-hidden="true" />
            <span>Paket saat ini</span>
            <strong>{currentPlan === "BETA" ? "Beta legacy" : formatPlan(currentPlan)}</strong>
            <small>{formatSubscriptionStatus(status, subscription?.trialEndsAt ?? null)}</small>
          </div>
        </div>

        {params.error ? (
          <div className="settings-note status-note-danger" role="alert">
            <strong>Pembayaran belum dapat diperbarui</strong>
            <p>{params.error}</p>
          </div>
        ) : null}
        {params.upgrade === "1" ? (
          <div className="settings-note subscription-return-note" role="status">
            <div>
              <strong>Fitur tersebut tersedia di paket yang lebih tinggi</strong>
              <p>Pilih Growth atau Business. Data workspace yang sudah ada tetap tersimpan.</p>
            </div>
          </div>
        ) : null}
        {params.synced === "1" ? (
          <div className="settings-note status-note-success" role="status">
            <strong>Status pembayaran sudah diperiksa</strong>
            <p>Paket hanya berubah jika status resmi Midtrans sudah berhasil.</p>
          </div>
        ) : null}
        {params.payment === "return" && callbackOrderId ? (
          <div className="settings-note subscription-return-note" role="status">
            <strong>Kembali dari halaman pembayaran</strong>
            <p>
              Redirect bukan bukti pembayaran. Periksa status resmi Midtrans agar paket
              segera diperbarui jika webhook belum masuk.
            </p>
            {isOwner ? (
              <form action={syncSubscriptionPaymentAction}>
                <input type="hidden" name="orderId" value={callbackOrderId} />
                <button className="secondary-button" type="submit">Periksa pembayaran</button>
              </form>
            ) : null}
          </div>
        ) : null}

        <div className="subscription-toolbar" aria-label="Siklus pembayaran">
          <div>
            <strong>Pilih siklus pembayaran</strong>
            <span>Tahunan membayar 10 bulan dan mendapat akses 12 bulan.</span>
          </div>
          <div className="subscription-cycle-switch">
            <Link
              className={billingCycle === "monthly" ? "active" : ""}
              href="/subscription?billing=monthly"
            >
              Bulanan
            </Link>
            <Link
              className={billingCycle === "annual" ? "active" : ""}
              href="/subscription?billing=annual"
            >
              Tahunan · hemat 2 bulan
            </Link>
          </div>
        </div>

        <div className="subscription-plan-grid">
          {subscriptionPlans.map((plan) => {
            const storedPlan = plan.id.toUpperCase();
            const isCurrent = currentPlan === storedPlan;
            const price = getPlanPrice(plan.id, billingCycle);
            return (
              <article
                className={"subscription-plan-card" + (plan.recommended ? " recommended" : "")}
                key={plan.id}
              >
                <div className="subscription-plan-heading">
                  <div>
                    <span>{plan.recommended ? "Paling fleksibel" : "Paket"}</span>
                    <h2>{plan.name}</h2>
                  </div>
                  {isCurrent ? <span className="status">Dipakai sekarang</span> : null}
                </div>
                <p>{plan.description}</p>
                <div className="subscription-price">
                  <strong>{formatIdr(price)}</strong>
                  <span>/{billingCycle === "annual" ? "tahun" : "bulan"}</span>
                </div>
                {billingCycle === "annual" ? (
                  <p className="subscription-saving">
                    Setara {formatIdr(getAnnualMonthlyEquivalent(plan.monthlyPrice))}/bulan ·
                    hemat {formatIdr(getAnnualSavings(plan.monthlyPrice))}
                  </p>
                ) : (
                  <p className="subscription-saving">
                    {plan.trialDays
                      ? "Gratis " + plan.trialDays + " hari untuk workspace baru"
                      : "Aktif setelah pembayaran"}
                  </p>
                )}
                <ul className="subscription-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}><Check size={16} aria-hidden="true" /> {feature}</li>
                  ))}
                </ul>
                {isOwner ? (
                  <SubscriptionCheckoutButton
                    plan={plan.id}
                    billingCycle={billingCycle}
                    disabled={!data.midtransConfigured}
                  />
                ) : (
                  <p className="muted">Hanya owner yang dapat mengubah paket.</p>
                )}
              </article>
            );
          })}
        </div>

        {!data.midtransConfigured ? (
          <div className="settings-note" role="status">
            <strong>Checkout belum dibuka</strong>
            <p>
              Tim Aijou perlu memasang MIDTRANS_SERVER_KEY. Tampilan paket tetap dapat
              diperiksa tanpa membuat transaksi palsu.
            </p>
          </div>
        ) : null}

        <section className="core-card subscription-history">
          <div className="feature-card-title">
            <div>
              <p className="eyebrow">Riwayat</p>
              <h2>Pembayaran langganan</h2>
            </div>
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          {data.business.subscriptionPayments.length === 0 ? (
            <div className="orders-empty">
              <CreditCard size={22} aria-hidden="true" />
              <strong>Belum ada pembayaran</strong>
              <p>Checkout yang dibuat dari halaman ini akan muncul di sini.</p>
            </div>
          ) : (
            <div className="subscription-payment-list">
              {data.business.subscriptionPayments.map((payment) => (
                <div className="subscription-payment-row" key={payment.id}>
                  <div>
                    <strong>{formatPlan(payment.plan)}</strong>
                    <span>{payment.orderId}</span>
                  </div>
                  <div>
                    <span>{formatIdr(Number(payment.amount))}</span>
                    <small>{payment.billingCycle === "ANNUAL" ? "Tahunan" : "Bulanan"}</small>
                  </div>
                  <span className={"status " + paymentStatusClass(payment.status)}>
                    {formatPaymentStatus(payment.status)}
                  </span>
                  <time dateTime={payment.createdAt.toISOString()}>
                    {payment.createdAt.toLocaleDateString("id-ID")}
                  </time>
                  {payment.status === "PENDING" && payment.redirectUrl && isOwner ? (
                    <a href={payment.redirectUrl} rel="noreferrer">Lanjut bayar</a>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="subscription-trust-row">
          <span><ShieldCheck size={18} aria-hidden="true" /> Harga dihitung server</span>
          <span><Clock3 size={18} aria-hidden="true" /> Webhook idempotent</span>
          <span><CalendarClock size={18} aria-hidden="true" /> Periode aktif tercatat</span>
        </div>
      </section>
    </AppShell>
  );
}

function formatPlan(plan: string) {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

function formatSubscriptionStatus(status: string, trialEndsAt: Date | null) {
  if (status === "TRIALING" && trialEndsAt) {
    return "Trial sampai " + trialEndsAt.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Makassar",
    });
  }
  if (status === "TRIALING") return "Trial aktif";
  if (status === "ACTIVE") return "Aktif";
  if (status === "PENDING_PAYMENT") return "Menunggu pembayaran";
  if (status === "PENDING_ACTIVATION") return "Menunggu verifikasi email";
  if (status === "PAST_DUE") return "Perlu tindak lanjut pembayaran";
  if (status === "CANCELED") return "Dibatalkan";
  if (status === "EXPIRED") return "Berakhir";
  return status;
}

function formatPaymentStatus(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Menunggu",
    SETTLED: "Berhasil",
    FAILED: "Gagal",
    EXPIRED: "Kedaluwarsa",
    CANCELED: "Dibatalkan",
    REFUNDED: "Dikembalikan",
    CHARGEBACK: "Chargeback",
  };
  return labels[status] ?? status;
}

function paymentStatusClass(status: string) {
  if (status === "SETTLED") return "";
  if (status === "PENDING") return "status-warning";
  return "status-danger";
}
