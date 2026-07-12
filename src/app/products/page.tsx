import { Archive, Package, Pencil, Plus } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  createProductAction,
  deleteProductAction,
  updateProductAction,
} from "@/app/products/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { formatCurrencyIDR } from "@/server/finance/transactions";
import { getProductsPage } from "@/server/products/catalog";

export default async function ProductsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getProductsPage(session.userId);

  return (
    <AppShell active="products" businessName={page.business?.businessName}>
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Katalog Aijou</p>
            <h1>Ajarkan Aijou apa yang bisa ditawarkan kepada pelanggan.</h1>
            <p>
              Produk aktif masuk ke konteks chat Aijou. Tambahkan harga mulai dan deskripsi yang
              jelas agar Aijou bisa merekomendasikan pilihan yang tepat tanpa mengarang detail.
            </p>
          </div>
        </div>

        <div className="core-grid product-catalog-grid">
          <section className="core-card">
            <div className="section-header">
              <div>
                <h2>Produk aktif</h2>
                <p className="muted">{page.products.length} produk tersimpan untuk {page.business?.businessName ?? "bisnis Anda"}.</p>
              </div>
            </div>
            {page.products.length === 0 ? (
              <div className="empty-state">
                <strong>Belum ada produk</strong>
                <p>Tambahkan produk atau jasa pertama agar Aijou punya referensi saat membantu pelanggan.</p>
              </div>
            ) : (
              <div className="products-grid">
                {page.products.map((product) => (
                  <article className={product.isActive ? "product-card" : "product-card product-card-muted"} key={product.id}>
                    <div className="product-thumb">
                      <Package size={24} aria-hidden="true" />
                    </div>
                    <div className="product-card-heading">
                      <strong>{product.name}</strong>
                      <span className={product.isActive ? "status" : "status status-warning"}>
                        {product.isActive ? "Aktif" : "Disembunyikan"}
                      </span>
                    </div>
                    <p className="muted">{product.description || "Belum ada deskripsi produk."}</p>
                    <span>{formatCurrencyIDR(product.price)}</span>
                    <details className="product-editor">
                      <summary><Pencil size={14} aria-hidden="true" /> Edit produk</summary>
                      <form className="form-grid" action={updateProductAction}>
                        <input name="productId" type="hidden" value={product.id} />
                        <label>
                          Nama produk
                          <input name="name" type="text" defaultValue={product.name} maxLength={120} required />
                        </label>
                        <label>
                          Harga mulai (Rp)
                          <input name="price" type="number" min="1" defaultValue={product.price} required />
                        </label>
                        <label className="span-2">
                          Deskripsi singkat
                          <textarea name="description" defaultValue={product.description ?? ""} maxLength={1000} />
                        </label>
                        <label className="checkbox-label span-2">
                          <input name="isActive" type="checkbox" defaultChecked={product.isActive} />
                          Produk ini boleh direkomendasikan Aijou
                        </label>
                        <button className="primary-button span-2" type="submit">Simpan perubahan</button>
                      </form>
                      <form action={deleteProductAction}>
                        <input name="productId" type="hidden" value={product.id} />
                        <button className="product-delete" type="submit"><Archive size={14} aria-hidden="true" /> Nonaktifkan produk</button>
                      </form>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="core-card product-create-card">
            <div className="section-header">
              <div>
                <h2>Tambah produk</h2>
                <p className="muted">Gunakan harga mulai bila harga akhir masih bergantung pada kebutuhan pelanggan.</p>
              </div>
              <Plus size={22} aria-hidden="true" />
            </div>
            <form className="form-grid" action={createProductAction}>
              <label>
                Nama produk atau jasa
                <input name="name" type="text" maxLength={120} placeholder="Contoh: Paket Setup WiFi Kantor" required />
              </label>
              <label>
                Harga mulai (Rp)
                <input name="price" type="number" min="1" placeholder="500000" required />
              </label>
              <label className="span-2">
                Deskripsi singkat
                <textarea name="description" maxLength={1000} placeholder="Jelaskan apa yang termasuk, batasan, atau kapan pelanggan perlu survei terlebih dahulu." />
              </label>
              <label className="checkbox-label span-2">
                <input name="isActive" type="checkbox" defaultChecked />
                Izinkan Aijou merekomendasikan produk ini di chat
              </label>
              <button className="primary-button span-2 icon-link" type="submit">
                <Plus size={17} aria-hidden="true" /> Tambahkan ke katalog
              </button>
            </form>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
