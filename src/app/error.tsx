"use client";

import Link from "next/link";
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

export default function ErrorPage({
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
      console.error("aijou.client.route_error", {
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
    <main className="system-state-page" role="alert" aria-live="assertive">
      <section className="system-state-card">
        <span className="eyebrow">Terjadi kendala</span>
        <h1>Workspace belum berhasil dimuat</h1>
        <p>
          Data kamu tetap aman. Coba muat ulang bagian ini, atau kembali ke dashboard jika masalahnya
          masih muncul.
        </p>
        <p className="system-state-reference">
          Referensi: <code>{reference}</code> · Lokasi: <code>{pathname}</code>
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
