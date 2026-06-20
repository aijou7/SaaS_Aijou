import {
  ArrowDownUp,
  ArrowLeft,
  CalendarDays,
  Download,
  Filter,
  ImagePlus,
  MapPin,
  Package,
  Plus,
  Search,
  Tags,
  WalletCards,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createTransactionAction } from "@/app/transactions/actions";
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

type TransactionsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const sampleProducts = [
  { name: "IT Support Visit", price: 350000, stock: 24, weight: 0 },
  { name: "WiFi Router Setup", price: 500000, stock: 12, weight: 650 },
  { name: "LAN Cable Installation", price: 150000, stock: 80, weight: 200 },
  { name: "Monthly Maintenance", price: 1500000, stock: 99, weight: 0 },
];

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const filters = parseTransactionFilters(resolvedSearchParams);
  const view = getSingleParam(resolvedSearchParams.view) ?? "orders";
  const modal = getSingleParam(resolvedSearchParams.modal);
  const page = await getTransactionsPage(session.userId, filters);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell active="transactions" businessName={page.business?.businessName}>
      {view === "create" ? (
        <CreateOrderPage today={today} />
      ) : view === "products" ? (
        <ProductsPage modal={modal} />
      ) : view === "balance" || view === "payment-settings" ? (
        <OrderSettingsPage view={view} />
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
  const completedOrders = page.transactions.filter((transaction) => transaction.status === "CONFIRMED").length;

  return (
    <section className="orders-page">
      <div className="orders-header">
        <div>
          <h1>Orders and Subscription</h1>
          <p>Track incoming orders, payment status, and fulfillment from one clean workspace.</p>
        </div>
        <div className="orders-header-actions">
          <button className="ghost-button icon-link" type="button">
            <CalendarDays size={17} aria-hidden="true" />
            Month
          </button>
          <Link className="primary-button" href="/transactions?view=create">
            Create Order
          </Link>
        </div>
      </div>

      <div className="orders-metrics">
        <MetricCard label="Balance" value={formatCurrencyIDR(0)} cta="Setup Now" href="/transactions?view=balance" />
        <MetricCard label="Total sales" value={formatCurrencyIDR(page.summary.totalConfirmedThisMonth)} delta="Rp0" />
        <MetricCard label="Total orders" value={page.summary.filteredCount} delta="0" />
        <MetricCard label="Completed Orders" value={completedOrders} delta="0" />
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
          </form>
          <button className="ghost-button icon-link" type="button">
            <Filter size={16} aria-hidden="true" />
            Filter By
          </button>
          <button className="ghost-button icon-link" type="button">
            <ArrowDownUp size={16} aria-hidden="true" />
            Sort by Newest Date
          </button>
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
                  <Link href={`/transactions?view=create&from=${transaction.id}`}>View</Link>
                </span>
              </div>
            ))
          )}
        </div>

        <div className="orders-pagination">
          <span>Show per Page:</span>
          <button className="ghost-button" type="button">
            100 rows
          </button>
        </div>
      </div>
    </section>
  );
}

function CreateOrderPage({ today }: { today: string }) {
  return (
    <form className="create-order-page" action={createTransactionAction}>
      <input name="transactionDate" type="hidden" value={today} />
      <input name="categoryName" type="hidden" value="Orders" />
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
          <section className="order-form-card">
            <h2>Order Items <sup>*</sup></h2>
            <div className="order-item-picker">
              <input name="description" type="text" placeholder="Search Product" />
              <Link className="ghost-button" href="/transactions?view=products">
                Select Products
              </Link>
              <Link className="ghost-button" href="/transactions?view=products&modal=create">
                Add Custom Item
              </Link>
            </div>
            <div className="order-items-table">
              <span>Product</span>
              <span>Price</span>
              <span>Quantity</span>
              <span>Total</span>
            </div>
            <div className="order-items-empty">
              <strong>Order Item Empty</strong>
              <p>There are currently no product in your order. Please add product first.</p>
            </div>
          </section>

          <section className="order-form-card">
            <h2>Payment</h2>
            <div className="payment-alert">
              <span>Xendit is not configured. Please set up Xendit to enable Link payment.</span>
              <Link className="primary-button" href="/transactions?view=payment-settings">
                Setup Xendit
              </Link>
            </div>
            <div className="payment-alert">
              <span>No bank accounts found. Please add a bank account to enable Manual payment.</span>
              <Link className="primary-button" href="/transactions?view=payment-settings">
                Setup Bank Account
              </Link>
            </div>
          </section>

          <section className="order-form-card order-summary-form">
            <h2>Order Summary</h2>
            <label>
              Subtotal
              <input name="totalAmount" type="number" min="1" step="1" placeholder="Rp0" required />
            </label>
            <label>
              Discount
              <input type="number" min="0" step="1" placeholder="0" />
            </label>
            <label>
              Shipping
              <input type="number" min="0" step="1" placeholder="0" />
            </label>
            <label>
              VAT
              <input type="number" min="0" step="1" placeholder="0" />
            </label>
            <label>
              Payment Status
              <select name="status" defaultValue="PENDING_CONFIRMATION">
                <option value="PENDING_CONFIRMATION">Pending</option>
                <option value="CONFIRMED">Paid</option>
                <option value="CANCELLED">Canceled</option>
              </select>
            </label>
          </section>
        </div>

        <aside className="client-card">
          <h2>Client Information</h2>
          <label>
            Customer <sup>*</sup>
            <input name="merchantName" type="text" placeholder="Search Customer" required />
          </label>
          <label>
            Address
            <textarea placeholder="Input address" />
          </label>
          <Link className="map-link" href="/transactions?view=create">
            <MapPin size={14} aria-hidden="true" />
            Select from map
          </Link>
          <label>
            Notes
            <input type="text" placeholder="Input notes" />
          </label>
        </aside>
      </div>
    </form>
  );
}

function ProductsPage({ modal }: { modal?: string }) {
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

      <form className="products-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder="Search Products" />
      </form>

      <div className="products-grid">
        {sampleProducts.map((product) => (
          <div className="product-card" key={product.name}>
            <div className="product-thumb">
              <Package size={24} aria-hidden="true" />
            </div>
            <strong>{product.name}</strong>
            <span>{formatCurrencyIDR(product.price)}</span>
            <small>Stock {product.stock}</small>
          </div>
        ))}
      </div>

      {modal === "create" ? <CreateProductModal /> : null}
    </section>
  );
}

function CreateProductModal() {
  return (
    <div className="product-modal-backdrop">
      <div className="product-modal">
        <div className="feature-card-title">
          <h2>Create Product</h2>
          <Link href="/transactions?view=products" aria-label="Close create product modal">
            <X size={22} aria-hidden="true" />
          </Link>
        </div>
        <label>
          Name <sup>*</sup>
          <input type="text" placeholder="Enter the product name" />
        </label>
        <label>
          Description
          <textarea placeholder="Enter Description" />
        </label>
        <div className="product-modal-row">
          <label>
            Price <sup>*</sup>
            <input type="number" placeholder="Rp 0" />
          </label>
          <label>
            Weight
            <input type="number" placeholder="0 grams" />
          </label>
          <label>
            Stock
            <input type="number" placeholder="0" />
          </label>
        </div>
        <div>
          <span className="product-image-label">Image</span>
          <div className="product-image-grid">
            {["Thumbnail", "Pic 2", "Pic 3", "Pic 4", "Pic 5", "Pic 6", "Pic 7", "Pic 8", "Pic 9"].map((label) => (
              <button className="product-image-slot" type="button" key={label}>
                <ImagePlus size={20} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
        <button className="primary-button product-modal-submit" type="button">
          Create
        </button>
      </div>
    </div>
  );
}

function OrderSettingsPage({ view }: { view: string }) {
  return (
    <section className="orders-page">
      <div className="orders-header">
        <div>
          <h1>{view === "balance" ? "Balance" : "Payment Settings"}</h1>
          <p>Set up withdrawals, payment links, and manual bank transfer options.</p>
        </div>
      </div>
      <div className="orders-metrics">
        <MetricCard label="Balance" value={formatCurrencyIDR(0)} cta="Setup Now" href="/transactions?view=payment-settings" />
        <MetricCard label="Xendit" value="Not configured" />
        <MetricCard label="Bank account" value="Missing" />
        <MetricCard label="Manual payment" value="Draft" />
      </div>
      <div className="orders-table-card settings-empty">
        <WalletCards size={28} aria-hidden="true" />
        <strong>Payment setup belum dikonfigurasi</strong>
        <p>MVP ini sudah menyiapkan surface-nya. Integrasi payment gateway bisa kita sambung setelah order flow stabil.</p>
      </div>
    </section>
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
