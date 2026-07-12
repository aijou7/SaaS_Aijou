import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Status Pembayaran | Aijou",
  robots: { index: false, follow: false },
};

type PaymentResultPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaymentResultPage({ searchParams }: PaymentResultPageProps) {
  const params = searchParams ? await searchParams : {};
  const state = getSingleParam(params.state);
  const cancelled = state === "cancelled";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="payment-result-title">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">AJ</span>
          <span>Aijou</span>
        </div>
        {cancelled ? (
          <XCircle size={44} aria-hidden="true" />
        ) : (
          <CheckCircle2 size={44} aria-hidden="true" />
        )}
        <h1 id="payment-result-title">
          {cancelled ? "Pembayaran belum diselesaikan" : "Pembayaran telah dikirim"}
        </h1>
        <p>
          {cancelled
            ? "Tidak ada status lunas yang dicatat. Kamu bisa kembali ke link pembayaran untuk mencoba lagi."
            : "Kami sedang memverifikasi status dari penyedia pembayaran. Status final akan dikonfirmasi oleh tim setelah webhook diterima."}
        </p>
        {!cancelled ? (
          <p className="muted">
            <Clock3 size={16} aria-hidden="true" /> Jangan bayar ulang jika saldo sudah terpotong.
          </p>
        ) : null}
        <Link className="primary-button" href="/login">Masuk ke Aijou</Link>
      </section>
    </main>
  );
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
