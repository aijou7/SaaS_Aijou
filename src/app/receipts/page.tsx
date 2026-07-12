import { CheckCircle2, ReceiptText, XCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import {
  confirmReceiptReviewAction,
  rejectReceiptReviewAction,
} from "@/app/receipts/actions";
import { formatAmountForInput, formatCurrencyIDR } from "@/server/finance/transactions";
import { getReceiptReviewPage } from "@/server/receipts/receipt-flow";

type ReceiptsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReceiptsPage({ searchParams }: ReceiptsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const params = searchParams ? await searchParams : {};
  const pageNumber = Math.max(1, Number(getSingleParam(params.page) ?? 1) || 1);
  const page = await getReceiptReviewPage(session.userId, { page: pageNumber });
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
              <span className="muted">
                {page.receipts.length} dari {page.pagination.total} receipt tampil
              </span>
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
                        <h3>Foto receipt</h3>
                        {receipt.mediaFile.storagePath || receipt.mediaFile.fileUrl ? (
                          <a
                            href={`/api/receipts/${encodeURIComponent(receipt.id)}/media`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Buka foto receipt asli di tab baru"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/receipts/${encodeURIComponent(receipt.id)}/media`}
                              alt={`Receipt ${receipt.transaction.merchantName || receipt.createdAt}`}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              style={{
                                display: "block",
                                maxHeight: 420,
                                width: "100%",
                                objectFit: "contain",
                                borderRadius: 12,
                              }}
                            />
                          </a>
                        ) : (
                          <p className="muted">
                            Preview gambar tidak tersedia. Media lama atau file lokal hanya bisa
                            dibuka dari storage server.
                          </p>
                        )}
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
                            maxLength={120}
                          />
                        </label>
                        <label>
                          Kategori
                          <input
                            name="categoryName"
                            list="receipt-category-options"
                            defaultValue={receipt.transaction.categoryName}
                            placeholder="Perlengkapan kantor"
                            maxLength={100}
                          />
                        </label>
                        <label>
                          Project
                          <input
                            name="projectName"
                            list="receipt-project-options"
                            defaultValue={receipt.transaction.projectName}
                            placeholder="Kantor A"
                            maxLength={120}
                          />
                        </label>
                        <label>
                          Deskripsi
                          <input
                            name="description"
                            type="text"
                            defaultValue={receipt.transaction.description}
                            placeholder="Nota belanja"
                            maxLength={500}
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

            {page.pagination.pageCount > 1 ? (
              <nav className="orders-pagination" aria-label="Pagination receipt">
                {page.pagination.page > 1 ? (
                  <Link className="ghost-button" href={`/receipts?page=${page.pagination.page - 1}`}>
                    Sebelumnya
                  </Link>
                ) : <span />}
                <span>
                  Halaman {page.pagination.page} dari {page.pagination.pageCount}
                </span>
                {page.pagination.page < page.pagination.pageCount ? (
                  <Link className="ghost-button" href={`/receipts?page=${page.pagination.page + 1}`}>
                    Berikutnya
                  </Link>
                ) : <span />}
              </nav>
            ) : null}
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

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
