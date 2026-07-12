"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type OrderProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
};

export function OrderBuilderFields({
  initialProductId,
  paymentReady,
  products,
}: {
  initialProductId?: string;
  paymentReady: boolean;
  products: OrderProduct[];
}) {
  const [productId, setProductId] = useState(initialProductId ?? "");
  const [quantity, setQuantity] = useState(1);
  const [customAmount, setCustomAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [vat, setVat] = useState("");
  const [description, setDescription] = useState(
    products.find((product) => product.id === initialProductId)?.description ?? "",
  );
  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId),
    [productId, products],
  );
  const baseAmount = selectedProduct
    ? selectedProduct.price * quantity
    : toPositiveNumber(customAmount);
  const finalAmount = Math.max(
    0,
    baseAmount - toPositiveNumber(discount) + toPositiveNumber(shipping) + toPositiveNumber(vat),
  );

  function selectProduct(nextId: string) {
    const product = products.find((item) => item.id === nextId);
    setProductId(nextId);
    setQuantity(1);
    setDescription(product?.description ?? "");
    if (product) setCustomAmount(String(product.price));
  }

  return (
    <>
      <section className="order-form-card">
        <h2>Order Items <sup>*</sup></h2>
        <div className="order-item-picker">
          <select
            name="productId"
            value={productId}
            onChange={(event) => selectProduct(event.target.value)}
          >
            <option value="">Custom order / jasa</option>
            {products.map((product) => (
              <option value={product.id} key={product.id}>
                {product.name} — {formatRupiah(product.price)}
              </option>
            ))}
          </select>
          <Link className="ghost-button" href="/transactions?view=products">
            Pilih dari katalog
          </Link>
          <Link className="ghost-button" href="/transactions?view=products&modal=create">
            Tambah produk
          </Link>
        </div>
        <div className="order-items-table">
          <span>Product</span>
          <span>Price</span>
          <span>Quantity</span>
          <span>Subtotal</span>
        </div>
        {selectedProduct ? (
          <div className="order-items-table order-items-selected">
            <span>{selectedProduct.name}</span>
            <span>{formatRupiah(selectedProduct.price)}</span>
            <input
              name="quantity"
              type="number"
              min="1"
              max="10000"
              value={quantity}
              onChange={(event) => setQuantity(clampInteger(event.target.value, 1, 10_000))}
              required
            />
            <span>{formatRupiah(selectedProduct.price * quantity)}</span>
          </div>
        ) : (
          <div className="order-items-empty">
            <strong>Custom order</strong>
            <p>Isi deskripsi dan subtotal manual, atau pilih produk dari katalog.</p>
          </div>
        )}
        <label>
          Deskripsi order
          <input
            name="description"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Contoh: Setup jaringan lantai 2"
            maxLength={500}
          />
        </label>
      </section>

      <section className="order-form-card">
        <h2>Payment</h2>
        <div className="payment-alert">
          <span>
            {paymentReady
              ? "Xendit siap. Setelah order dibuat, buat link dari tabel Orders lalu kirim ke customer."
              : "Xendit belum siap. Lengkapi credential dan webhook sebelum membuat payment link."}
          </span>
          <Link className="primary-button" href="/payments">
            {paymentReady ? "Kelola Xendit" : "Setup Xendit"}
          </Link>
        </div>
      </section>

      <section className="order-form-card order-summary-form">
        <h2>Order Summary</h2>
        <label>
          Subtotal
          <input
            name="totalAmount"
            type="number"
            min="1"
            step="1"
            value={selectedProduct ? baseAmount : customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            readOnly={Boolean(selectedProduct)}
            placeholder="Rp0"
            required
          />
        </label>
        <label>
          Discount
          <input name="discount" type="number" min="0" step="1" value={discount} onChange={(event) => setDiscount(event.target.value)} placeholder="0" />
        </label>
        <label>
          Shipping
          <input name="shipping" type="number" min="0" step="1" value={shipping} onChange={(event) => setShipping(event.target.value)} placeholder="0" />
        </label>
        <label>
          VAT
          <input name="vat" type="number" min="0" step="1" value={vat} onChange={(event) => setVat(event.target.value)} placeholder="0" />
        </label>
        <label>
          Payment Status
          <select name="status" defaultValue="PENDING_CONFIRMATION">
            <option value="PENDING_CONFIRMATION">Pending</option>
            <option value="CONFIRMED">Paid</option>
            <option value="CANCELLED">Canceled</option>
          </select>
        </label>
        <p className="muted span-2" aria-live="polite">
          Total order: <strong>{formatRupiah(finalAmount)}</strong>
        </p>
      </section>
    </>
  );
}

function toPositiveNumber(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function clampInteger(value: string, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

function formatRupiah(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}
