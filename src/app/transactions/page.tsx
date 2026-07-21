import {
  ArrowLeft,
  CalendarDays,
  Download,
  Filter,
  Package,
  Search,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createTransactionAction } from "@/app/transactions/actions";
import { createProductAction } from "@/app/products/actions";
import { createPaymentLinkAction } from "@/app/payments/actions";
import { OrderBuilderFields } from "@/app/transactions/order-builder-fields";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import {
  buildExportUrl,
  formatCurrencyIDR,
  formatTransactionSource,
  formatTransactionStatus,
  getTransactionsPage,
  parseTransactionFilters,
} from "@/server/finance/transactions";
import { getPaymentReadinessForBusiness } from "@/server/payments/payments";

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = parseTransactionFilters(resolvedSearchParams);
  const view = getSingleParam(resolvedSearchParams.view) ?? "orders";
  const modal = getSingleParam(resolvedSearchParams.modal);
  const selectedProductId = getSingleParam(resolvedSearchParams.productId);
  const productQuery = (getSingleParam(resolvedSearchParams.productQ) ?? "").trim().toLowerCase();
  if (view === "balance" || view === "payment-settings") {
    redirect("/payments");
  }
  const page = await getTransactionsPage(session.userId, filters);
  const paymentReady =
    view === "create" && page.business
      ? await getPaymentReadinessForBusiness(page.business.id)
      : false;
  const visibleProducts = productQuery
    ? page.products.filter((product) =>
        `${product.name} ${product.description ?? ""}`.toLowerCase().includes(productQuery),
      )
    : page.products;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell active="transactions" businessName={page.business?.businessName}>
      {view === "create" ? (
        <CreateOrderPage
          today={today}
          products={page.products}
          selectedProductId={selectedProductId}
          paymentReady={paymentReady}
        />
      ) : view === "products" ? (
        <ProductsPage modal={modal} productQuery={productQuery} products={visibleProducts} />
      ) : (
        <OrdersPage filters={filters} page={page} />
      )}
    </AppShell>
  );
}

function OrdersPage({
  filters,
  page,
}: {
  filters: ReturnType<typeof parseTransactionFilters>;
  page: Awaited<ReturnType<typeof getTransactionsPage>>;
}) {
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  return (
    <section className="orders-page">
      <div className="orders-header">
        <div>
          <h1>Orders and Subscription</h1>
          <p>Track incoming orders, payment status, and fulfillment from one clean workspace.</p>
        </div>
        <div className="orders-header-actions">
          <Link className="ghost-button icon-link" href={`/transactions?dateFrom=${monthStart}`}>
            <CalendarDays size={17} aria-hidden="true" />
            Month
          </Link>
          <Link className="primary-button" href="/transactions?view=create">
            Create Order
          </Link>
        </div>
      </div>

      <div className="orders-metrics">
        <MetricCard label="Revenue bulan ini" value={formatCurrencyIDR(page.summary.totalConfirmedThisMonth)} />
        <MetricCard label="Total orders" value={page.summary.filteredCount} />
        <MetricCard label="Paid / confirmed" value={page.summary.confirmedCount} />
        <MetricCard label="Pending review" value={page.summary.totalPending + page.summary.totalNeedsReview} />
      </div>

      <div className="orders-table-card">
        <div className="orders-toolbar">
          <a className="ghost-button icon-link" href={buildExportUrl(filters)}>
            <Download size={16} aria-hidden="true" />
            Export
          </a>
          <form className="orders-search-form" action="/transactions" method="get">
            <Search size={16} aria-hidden="true" />
            <input
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              placeholder="Search customer name, email, phone, address..."
            />
            {filters.status ? <input name="status" type="hidden" value={filters.status} /> : null}
            {filters.transactionType ? <input name="transactionType" type="hidden" value={filters.transactionType} /> : null}
          </form>
          <form className="orders-filter-form" action="/transactions" method="get">
            <Filter size={16} aria-hidden="true" />
            <select name="transactionType" defaultValue={filters.transactionType ?? ""} aria-label="Transaction type">
              <option value="">Semua tipe</option>
              <option value="INCOME">Order / income</option>
              <option value="EXPENSE">Expense</option>
            </select>
            <select name="status" defaultValue={filters.status ?? ""} aria-label="Payment status">
              <option value="">Semua status</option>
              <option value="PENDING_CONFIRMATION">Pending</option>
              <option value="CONFIRMED">Paid / confirmed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="NEEDS_REVIEW">Needs review</option>
            </select>
            {filters.q ? <input name="q" type="hidden" value={filters.q} /> : null}
            <button className="ghost-button" type="submit">Terapkan</button>
          </form>
        </div>

        <div className="orders-table">
          <div className="orders-table-head">
            <span>Customer</span>
            <span>Created Date</span>
            <span>Platform</span>
            <span>Payment Status</span>
            <span>Item</span>
            <span>Amount</span>
            <span>Order Status</span>
            <span>Action</span>
          </div>

          {page.transactions.length === 0 ? (
            <div className="orders-empty">
              <strong>No orders found</strong>
              <p>No orders match your current search or filters.</p>
            </div>
          ) : (
            page.transactions.map((transaction) => (
              <div className="orders-table-row" key={transaction.id}>
                <span>{transaction.merchantName || "Walk-in Customer"}</span>
                <span>{transaction.transactionDate}</span>
                <span>{formatTransactionSource(transaction.source)}</span>
                <span>
                  <StatusBadge status={transaction.status} />
                </span>
                <span>{transaction.description || transaction.categoryName || "Custom order"}</span>
                <span>{formatCurrencyIDR(transaction.totalAmount)}</span>
                <span>
                  <StatusBadge status={transaction.status} />
                </span>
                <span>
                  {transaction.payment?.paymentLinkUrl ? (
                    <a href={transaction.payment.paymentLinkUrl} target="_blank" rel="noreferrer">
                      Pay link
                    </a>
                  ) : transaction.transactionType === "INCOME" && transaction.status !== "CONFIRMED" ? (
                    <form action={createPaymentLinkAction}>
                      <input name="transactionId" type="hidden" value={transaction.id} />
                      <button className="table-link-button" type="submit">Create link</button>
                    </form>
                  ) : (
                    <span className="muted">Recorded</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>

        <div className="orders-pagination">
          <span>
            Halaman {page.summary.page} dari {page.summary.pageCount} · {page.summary.filteredCount} data
          </span>
          <div className="orders-header-actions">
            {page.summary.page > 1 ? (
              <Link className="ghost-button" href={buildPageUrl(filters, page.summary.page - 1)}>Sebelumnya</Link>
            ) : null}
            {page.summary.page < page.summary.pageCount ? (
              <Link className="ghost-button" href={buildPageUrl(filters, page.summary.page + 1)}>Berikutnya</Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function CreateOrderPage({
  paymentReady,
  products,
  selectedProductId,
  today,
}: {
  paymentReady: boolean;
  products: Array<{ id: string; name: string; description: string | null; price: number; currency: string }>;
  selectedProductId?: string;
  today: string;
}) {
  return (
    <form className="create-order-page" action={createTransactionAction}>
      <input name="transactionDate" type="hidden" value={today} />
      <input name="transactionType" type="hidden" value="INCOME" />
      <input name="categoryName" type="hidden" value="Penjualan" />
      <input name="projectName" type="hidden" value="Dashboard Orders" />

      <div className="create-order-header">
        <Link className="back-link" href="/transactions" aria-label="Back to orders">
          <ArrowLeft size={22} aria-hidden="true" />
        </Link>
        <h1>Create Order</h1>
        <div className="create-order-actions">
          <Link className="ghost-button" href="/transactions?view=create">
            Clear
          </Link>
          <button className="primary-button" type="submit">
            Create Order
          </button>
        </div>
      </div>

      <div className="create-order-grid">
        <div className="create-order-main">
          <OrderBuilderFields
            initialProductId={selectedProductId}
            paymentReady={paymentReady}
            products={products}
          />
        </div>

        <aside className="client-card">
          <h2>Client Information</h2>
          <label>
            Customer <sup>*</sup>
            <input name="merchantName" type="text" placeholder="Nama customer" maxLength={120} required />
          </label>
          <label>
            Nomor WhatsApp
            <input name="customerPhone" type="tel" placeholder="62812..." maxLength={40} />
          </label>
          <label>
            Address
            <textarea name="address" placeholder="Alamat customer/project" maxLength={500} />
          </label>
          <label>
            Notes
            <input name="notes" type="text" placeholder="Catatan internal" maxLength={500} />
          </label>
        </aside>
      </div>
    </form>
  );
}

function ProductsPage({
  modal,
  productQuery,
  products,
}: {
  modal?: string;
  productQuery: string;
  products: Array<{ id: string; name: string; description: string | null; price: number; currency: string }>;
}) {
  return (
    <section className="products-page">
      <div className="orders-header">
        <div>
          <h1>Products</h1>
          <p>Reusable product and service catalog for order creation.</p>
        </div>
        <Link className="primary-button" href="/transactions?view=products&modal=create">
          Create Product
        </Link>
      </div>

      <form className="products-search" action="/transactions" method="get">
        <input name="view" type="hidden" value="products" />
        <Search size={16} aria-hidden="true" />
        <input name="productQ" type="search" defaultValue={productQuery} placeholder="Search Products" />
        <button className="ghost-button" type="submit">Cari</button>
      </form>

      <div className="products-grid">
        {products.length === 0 ? (
          <div className="orders-empty">
            <strong>Belum ada produk aktif</strong>
            <p>Tambahkan produk pertama agar bisa dipilih saat membuat order.</p>
          </div>
        ) : products.map((product) => (
          <Link
            className="product-card"
            href={`/transactions?view=create&productId=${encodeURIComponent(product.id)}`}
            key={product.id}
          >
            <div className="product-thumb">
              <Package size={24} aria-hidden="true" />
            </div>
            <strong>{product.name}</strong>
            <span>{formatCurrencyIDR(product.price)}</span>
            <small>{product.description || "Klik untuk tambahkan ke order"}</small>
          </Link>
        ))}
      </div>

      {modal === "create" ? <CreateProductModal /> : null}
    </section>
  );
}

function CreateProductModal() {
  return (
    <div className="product-modal-backdrop" role="presentation">
      <form
        aria-labelledby="create-product-title"
        aria-modal="true"
        className="product-modal"
        action={createProductAction}
        role="dialog"
      >
        <div className="feature-card-title">
          <h2 id="create-product-title">Create Product</h2>
          <Link href="/transactions?view=products" aria-label="Close create product modal">
            <X size={22} aria-hidden="true" />
          </Link>
        </div>
        <label>
          Name <sup>*</sup>
          <input name="name" type="text" placeholder="Enter the product name" maxLength={120} required />
        </label>
        <label>
          Description
          <textarea name="description" placeholder="Enter Description" maxLength={1000} />
        </label>
        <div className="product-modal-row">
          <label>
            Price <sup>*</sup>
            <input name="price" type="number" min="1" step="1" placeholder="Rp 0" required />
          </label>
        </div>
        <input name="currency" type="hidden" value="IDR" />
        <input name="sortOrder" type="hidden" value="0" />
        <input name="isActive" type="hidden" value="on" />
        <button className="primary-button product-modal-submit" type="submit">
          Create
        </button>
      </form>
    </div>
  );
}

function MetricCard({
  cta,
  delta,
  href,
  label,
  value,
}: {
  cta?: string;
  delta?: string;
  href?: string;
  label: string;
  value: number | string;
}) {
  return (
    <div className="order-metric-card">
      <div>
        <span>{label}</span>
        {delta ? <small>▲ {delta}</small> : null}
      </div>
      <strong>{value}</strong>
      {cta && href ? <Link href={href}>{cta}</Link> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isPaid = status === "CONFIRMED";
  const isCanceled = status === "CANCELLED" || status === "REJECTED";

  return (
    <span className={isPaid ? "order-badge paid" : isCanceled ? "order-badge canceled" : "order-badge pending"}>
      {isPaid ? "Paid" : isCanceled ? "Canceled" : formatTransactionStatus(status)}
    </span>
  );
}

function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function buildPageUrl(
  filters: ReturnType<typeof parseTransactionFilters>,
  page: number,
) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "" && key !== "page") {
      params.set(key, String(value));
    }
  }

  params.set("page", String(page));
  return `/transactions?${params.toString()}`;
}
