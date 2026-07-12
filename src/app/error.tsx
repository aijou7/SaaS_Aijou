"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Aijou route error", { digest: error.digest ?? "unknown" });
  }, [error]);

  return (
    <main className="system-state-page" role="alert" aria-live="assertive">
      <section className="system-state-card">
        <span className="eyebrow">Terjadi kendala</span>
        <h1>Workspace belum berhasil dimuat</h1>
        <p>
          Data kamu tetap aman. Coba muat ulang bagian ini, atau kembali ke dashboard jika masalahnya
          masih muncul.
        </p>
        <div className="system-state-actions">
          <button className="primary-button" type="button" onClick={reset}>
            Coba lagi
          </button>
          <Link className="ghost-button" href="/dashboard">
            Ke dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
