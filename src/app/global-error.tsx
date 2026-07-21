"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  claimAutomaticRecovery,
  getErrorDigest,
  sanitizeRuntimePath,
} from "@/lib/runtime-errors";

function subscribeToPathname() {
  return () => undefined;
}

function getBrowserPathname() {
  return sanitizeRuntimePath(window.location.pathname);
}

function getServerPathname() {
  return "/unknown";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const reference = getErrorDigest(error);
  const pathname = useSyncExternalStore(
    subscribeToPathname,
    getBrowserPathname,
    getServerPathname,
  );
  const recoveryDecision = useRef<{ key: string; shouldRecover: boolean } | null>(null);

  useEffect(() => {
    const decisionKey = `${pathname}:${reference}`;

    if (recoveryDecision.current?.key !== decisionKey) {
      let shouldRecover = false;
      try {
        shouldRecover = claimAutomaticRecovery(
          window.sessionStorage,
          pathname,
          reference,
        );
      } catch {
        shouldRecover = false;
      }

      recoveryDecision.current = { key: decisionKey, shouldRecover };
      console.error("aijou.client.global_error", {
        path: pathname,
        recovery: shouldRecover ? "automatic" : "manual",
        reference,
      });
    }

    const shouldRecover = recoveryDecision.current?.shouldRecover ?? false;

    if (!shouldRecover) {
      return;
    }

    const timeoutId = window.setTimeout(reset, 700);
    return () => window.clearTimeout(timeoutId);
  }, [pathname, reference, reset]);

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
            <p
              style={{
                color: "#64748b",
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
                fontSize: 12,
                lineHeight: 1.6,
                margin: "0 0 22px",
                overflowWrap: "anywhere",
              }}
            >
              Referensi: {reference} · Lokasi: {pathname}
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
