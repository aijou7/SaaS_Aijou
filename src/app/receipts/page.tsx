import { CheckCircle2, ReceiptText, XCircle } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import {
  confirmReceiptReviewAction,
  rejectReceiptReviewAction,
} from "@/app/receipts/actions";
import { formatAmountForInput, formatCurrencyIDR } from "@/server/finance/transactions";
import { getReceiptReviewPage } from "@/server/receipts/receipt-flow";

export default async function ReceiptsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getReceiptReviewPage(session.userId);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell active="receipts" businessName={page.business?.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">Receipt OCR</p>
          <h1>Review foto nota sebelum jadi transaksi final.</h1>
          <p>
            Foto dari WhatsApp masuk sebagai draft. Koreksi nominal, merchant, kategori,
            dan project sebelum confirm.
          </p>
        </section>

        <section className="grid" aria-label="Ringkasan receipt">
          <div className="card">
            <ReceiptText size={22} aria-hidden="true" />
            <h2>Needs Review</h2>
            <div className="metric">{page.summary.needsReview}</div>
            <p className="muted">OCR rendah atau belum lengkap.</p>
          </div>
          <div className="card">
            <CheckCircle2 size={22} aria-hidden="true" />
            <h2>Reviewed</h2>
            <div className="metric">{page.summary.reviewed}</div>
            <p className="muted">Sudah dikonfirmasi owner.</p>
          </div>
          <div className="card">
            <XCircle size={22} aria-hidden="true" />
            <h2>Pending</h2>
            <div className="metric">{page.summary.pending}</div>
            <p className="muted">Menunggu keputusan.</p>
          </div>
        </section>

        <datalist id="receipt-category-options">
          {page.categories.map((category) => (
            <option key={category.id} value={category.name} />
          ))}
        </datalist>
        <datalist id="receipt-project-options">
          {page.projects.map((project) => (
            <option key={project.id} value={project.projectName} />
          ))}
        </datalist>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <h2>Receipt Inbox</h2>
              <span className="muted">{page.receipts.length} receipt tampil</span>
            </div>

            {page.receipts.length === 0 ? (
              <p className="muted">Belum ada receipt. Kirim foto nota dari WhatsApp webhook.</p>
            ) : (
              <div className="transaction-list">
                {page.receipts.map((receipt) => (
                  <details className="transaction-item" key={receipt.id}>
                    <summary>
                      <span>
                        <strong>
                          {receipt.transaction.merchantName ||
                            receipt.transaction.description ||
                            "Receipt image"}
                        </strong>
                        <small>
                          {receipt.createdAt} · Confidence{" "}
                          {receipt.confidenceScore === null
                            ? "-"
                            : `${Math.round(receipt.confidenceScore * 100)}%`}{" "}
                          · Media {receipt.mediaFile.providerMediaId ?? "local"}
                        </small>
                      </span>
                      <span className="transaction-summary">
                        <span>{formatCurrencyIDR(receipt.transaction.totalAmount)}</span>
                        <span
                          className={
                            receipt.reviewStatus === "REVIEWED"
                              ? "status"
                              : "status status-warning"
                          }
                        >
                          {formatReceiptStatus(receipt.reviewStatus)}
                        </span>
                      </span>
                    </summary>

                    <div className="receipt-review-grid">
                      <div>
                        <h3>OCR Raw Text</h3>
                        <pre className="ocr-box">
                          {receipt.rawOcrText || "Belum ada raw OCR text."}
                        </pre>
                      </div>

                      <form className="form-grid edit-form" action={confirmReceiptReviewAction}>
                        <input name="receiptId" type="hidden" value={receipt.id} />
                        <label>
                          Tanggal
                          <input
                            name="transactionDate"
                            type="date"
                            defaultValue={receipt.transaction.transactionDate || today}
                            required
                          />
                        </label>
                        <label>
                          Nominal
                          <input
                            name="totalAmount"
                            type="number"
                            min="1"
                            step="1"
                            defaultValue={formatAmountForInput(receipt.transaction.totalAmount)}
                            required
                          />
                        </label>
                        <label>
                          Merchant
                          <input
                            name="merchantName"
                            type="text"
                            defaultValue={receipt.transaction.merchantName}
                            placeholder="Toko Sinar Jaya"
                          />
                        </label>
                        <label>
                          Kategori
                          <input
                            name="categoryName"
                            list="receipt-category-options"
                            defaultValue={receipt.transaction.categoryName}
                            placeholder="Perlengkapan kantor"
                          />
                        </label>
                        <label>
                          Project
                          <input
                            name="projectName"
                            list="receipt-project-options"
                            defaultValue={receipt.transaction.projectName}
                            placeholder="Kantor A"
                          />
                        </label>
                        <label>
                          Deskripsi
                          <input
                            name="description"
                            type="text"
                            defaultValue={receipt.transaction.description}
                            placeholder="Nota belanja"
                          />
                        </label>
                        <div className="form-actions span-2">
                          <button className="primary-button" type="submit">
                            Confirm receipt
                          </button>
                        </div>
                      </form>
                    </div>

                    <form action={rejectReceiptReviewAction}>
                      <input name="receiptId" type="hidden" value={receipt.id} />
                      <button className="danger-button" type="submit">
                        Reject receipt
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
    </AppShell>
  );
}

function formatReceiptStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
