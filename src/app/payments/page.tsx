import { CheckCircle2, Link2, QrCode, WalletCards } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updatePaymentSettingsAction } from "@/app/payments/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import {
  formatCurrencyIDR,
  getTransactionsPage,
  parseTransactionFilters,
} from "@/server/finance/transactions";
import { getPaymentsPage } from "@/server/payments/payments";

export default async function PaymentsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getTransactionsPage(
    session.userId,
    parseTransactionFilters({ transactionType: "INCOME" }),
  );
  const payments = await getPaymentsPage(session.userId);
  return (
    <AppShell active="payments" businessName={page.business?.businessName}>
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Payments</p>
            <h1>Buat payment link dengan aman, lalu status order otomatis terbarui.</h1>
            <p>
              Setelah customer setuju, tim membuat order dan payment link Xendit. Webhook yang
              tervalidasi akan mengubah status order menjadi paid secara idempotent.
            </p>
          </div>
          <Link className="primary-button icon-link" href="/transactions?view=create">
            <Link2 size={17} aria-hidden="true" />
            Create test order
          </Link>
        </div>

        <div className="core-metrics">
          <div className="core-metric">
            <WalletCards size={20} aria-hidden="true" />
            <span>Revenue this month</span>
            <strong>{formatCurrencyIDR(page.summary.totalConfirmedThisMonth)}</strong>
          </div>
          <div className="core-metric">
            <CheckCircle2 size={20} aria-hidden="true" />
            <span>Paid orders</span>
            <strong>{payments.summary.completed}</strong>
          </div>
          <div className="core-metric">
            <QrCode size={20} aria-hidden="true" />
            <span>Pending payments</span>
            <strong>{payments.summary.pending}</strong>
          </div>
        </div>

        <div className="core-grid">
          <section className="core-card">
            <div className="feature-card-title">
              <h2>Xendit Payment Session</h2>
              <span className={payments.ready ? "status" : "status status-warning"}>
                {payments.ready ? "Ready" : "Needs setup"}
              </span>
            </div>
            <form className="form-grid" action={updatePaymentSettingsAction}>
              <label className="span-2">
                Secret API key
                <input
                  name="secretKey"
                  type="password"
                  autoComplete="off"
                  maxLength={4096}
                  required={Boolean(payments.configurationIssue)}
                  placeholder={`Current: ${payments.settings?.secretKeyMasked ?? "Not set"}`}
                />
              </label>
              <label className="span-2">
                Webhook verification token
                <input
                  name="webhookToken"
                  type="password"
                  autoComplete="off"
                  maxLength={4096}
                  required={Boolean(payments.configurationIssue)}
                  placeholder={`Current: ${payments.settings?.webhookTokenMasked ?? "Not set"}`}
                />
              </label>
              <label className="checkbox-label">
                <input name="isActive" type="checkbox" defaultChecked={payments.settings?.isActive} />
                Aktifkan payment link
              </label>
              <button className="primary-button span-2" type="submit">Simpan payment settings</button>
            </form>
            {payments.configurationIssue ? (
              <div className="settings-note" role="alert">
                {payments.configurationIssue}
              </div>
            ) : null}
            <p className="muted">
              Mode terdeteksi: {payments.settings?.testMode ? "Development / test" : "Production / live"}.
              Mode mengikuti API key Xendit dan tidak dapat diubah dari checkbox lokal.
            </p>
            <p className="muted">
              Webhook: {(process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app") + "/api/webhooks/xendit"}
            </p>
            <div className="checklist">
              <div className="checklist-item">
                <QrCode size={18} aria-hidden="true" />
                <span>
                  <strong>QRIS / VA / e-wallet</strong>
                  <small>Metode pembayaran akan mengikuti konfigurasi Xendit.</small>
                </span>
              </div>
              <div className="checklist-item">
                <Link2 size={18} aria-hidden="true" />
                <span>
                  <strong>Payment link</strong>
                  <small>Tim dapat membuat link dari Orders lalu mengirimkannya ke customer.</small>
                </span>
              </div>
            </div>
          </section>

          <section className="core-card">
            <h2>Aktivitas payment terbaru</h2>
            {payments.recent.length === 0 ? (
              <div className="orders-empty">
                <strong>Belum ada payment session</strong>
                <p>Buat order, lalu generate payment link dari halaman Orders.</p>
              </div>
            ) : (
              <div className="checklist">
                {payments.recent.map((payment) => (
                  <div className="checklist-item" key={payment.id}>
                    <WalletCards size={18} aria-hidden="true" />
                    <span>
                      <strong>{payment.transaction.merchantName || payment.referenceId}</strong>
                      <small>{formatCurrencyIDR(payment.amount)} · {payment.status}</small>
                    </span>
                    {payment.paymentLinkUrl ? (
                      <a href={payment.paymentLinkUrl} target="_blank" rel="noreferrer">Buka</a>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </AppShell>
  );
}
