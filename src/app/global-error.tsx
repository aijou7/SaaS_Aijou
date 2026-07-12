"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Aijou global error", { digest: error.digest ?? "unknown" });
  }, [error]);

  return (
    <html lang="id">
      <body>
        <main
          style={{
            alignItems: "center",
            background: "#f5f6f8",
            color: "#111827",
            display: "flex",
            fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
            justifyContent: "center",
            minHeight: "100vh",
            padding: 24,
          }}
        >
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 20,
              boxShadow: "0 18px 50px rgba(15, 23, 42, 0.08)",
              maxWidth: 560,
              padding: 32,
              textAlign: "center",
            }}
          >
            <p style={{ color: "#64748b", fontWeight: 700, margin: "0 0 10px" }}>
              Aijou AI
            </p>
            <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Aplikasi perlu dimuat ulang</h1>
            <p style={{ color: "#64748b", lineHeight: 1.6, margin: "0 0 22px" }}>
              Ada gangguan sementara saat membuka workspace. Data yang sudah tersimpan tidak hilang.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                background: "#2563eb",
                border: 0,
                borderRadius: 10,
                color: "#ffffff",
                cursor: "pointer",
                fontWeight: 700,
                padding: "11px 18px",
              }}
            >
              Muat ulang aplikasi
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
