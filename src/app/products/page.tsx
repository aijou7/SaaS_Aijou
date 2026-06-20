import { ImagePlus, Package, Plus, Search } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { formatCurrencyIDR } from "@/server/finance/transactions";
import { getSession } from "@/lib/session";

const products = [
  {
    name: "IT Support Visit",
    description: "Kunjungan teknisi untuk troubleshooting jaringan atau perangkat.",
    price: 350000,
  },
  {
    name: "WiFi Router Setup",
    description: "Setup router, SSID, password, basic security, dan testing koneksi.",
    price: 500000,
  },
  {
    name: "LAN Cable Installation",
    description: "Instalasi kabel LAN per titik, belum termasuk kebutuhan material khusus.",
    price: 150000,
  },
  {
    name: "Monthly IT Maintenance",
    description: "Support bulanan untuk kantor kecil, termasuk remote support dan visit ringan.",
    price: 1500000,
  },
];

export default async function ProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  return (
    <AppShell active="products">
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Product Catalog</p>
            <h1>Produk dan harga yang bisa dipakai AI buat closing.</h1>
            <p>
              Catalog ini nanti jadi sumber AI saat merekomendasikan produk, menghitung estimasi,
              dan membuat payment link.
            </p>
          </div>
          <Link className="primary-button icon-link" href="/products?modal=create">
            <Plus size={17} aria-hidden="true" />
            Create Product
          </Link>
        </div>

        <form className="products-search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder="Search products" />
        </form>

        <div className="products-grid">
          {products.map((product) => (
            <article className="product-card" key={product.name}>
              <div className="product-thumb">
                <Package size={24} aria-hidden="true" />
              </div>
              <strong>{product.name}</strong>
              <p className="muted">{product.description}</p>
              <span>{formatCurrencyIDR(product.price)}</span>
            </article>
          ))}
        </div>

        <section className="core-card">
          <div className="section-header">
            <div>
              <h2>Next database step</h2>
              <p className="muted">
                Setelah UI katalog ini cocok, kita tambah tabel Product dan Order supaya AI bisa
                generate invoice/payment berdasarkan produk real.
              </p>
            </div>
            <ImagePlus size={24} aria-hidden="true" />
          </div>
        </section>
      </section>
    </AppShell>
  );
}
