import { CheckCircle2, Link2, QrCode, WalletCards } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import {
  formatCurrencyIDR,
  getTransactionsPage,
  parseTransactionFilters,
} from "@/server/finance/transactions";

export default async function PaymentsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getTransactionsPage(session.userId, parseTransactionFilters({}));
  const paidCount = page.transactions.filter((transaction) => transaction.status === "CONFIRMED").length;
  const pendingCount = page.transactions.filter((transaction) => transaction.status === "PENDING_CONFIRMATION").length;

  return (
    <AppShell active="payments" businessName={page.business?.businessName}>
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Payments</p>
            <h1>AI bisa closing, kirim payment link, lalu laporan otomatis update.</h1>
            <p>
              Target flow: customer setuju beli, AI buat order, Xendit generate QRIS/VA/e-wallet,
              payment webhook mengubah status jadi paid dan masuk report.
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
            <strong>{paidCount}</strong>
          </div>
          <div className="core-metric">
            <QrCode size={20} aria-hidden="true" />
            <span>Pending payments</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>

        <div className="core-grid">
          <section className="core-card">
            <h2>Xendit setup</h2>
            <div className="payment-alert">
              <span>Xendit belum dikonfigurasi. Nanti kita simpan API key per workspace.</span>
              <button className="primary-button" type="button">
                Setup Xendit
              </button>
            </div>
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
                  <small>AI mengirim link setelah customer konfirmasi order.</small>
                </span>
              </div>
            </div>
          </section>

          <section className="core-card">
            <h2>Payment automation plan</h2>
            <div className="flow-builder">
              <div className="flow-step">
                <span>
                  <strong>1. AI confirms cart</strong>
                  <small>Produk, harga, customer, dan alamat dikonfirmasi di chat.</small>
                </span>
              </div>
              <div className="flow-step">
                <span>
                  <strong>2. Create invoice</strong>
                  <small>Sistem hit Xendit dan kirim payment link ke customer.</small>
                </span>
              </div>
              <div className="flow-step">
                <span>
                  <strong>3. Webhook paid</strong>
                  <small>Status order berubah paid dan revenue masuk report.</small>
                </span>
              </div>
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
