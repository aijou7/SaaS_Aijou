import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="system-state-page">
      <section className="system-state-card">
        <span className="eyebrow">404</span>
        <h1>Halaman tidak ditemukan</h1>
        <p>Alamat ini sudah tidak tersedia atau URL-nya kurang tepat.</p>
        <div className="system-state-actions">
          <Link className="primary-button" href="/dashboard">
            Kembali ke dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
