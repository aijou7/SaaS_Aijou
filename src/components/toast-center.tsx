"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type ToastPayload = { kind?: ToastKind; message: string };

export function ToastCenter() {
  const [toast, setToast] = useState<(ToastPayload & { id: number }) | null>(null);
  const nextId = useRef(1);

  useEffect(() => {
    const show = (payload: ToastPayload) => setToast({ ...payload, id: nextId.current++ });
    const onToast = (event: Event) => show((event as CustomEvent<ToastPayload>).detail);
    window.addEventListener("aijou:toast", onToast);

    const params = new URLSearchParams(window.location.search);
    const queryToast = toastFromQuery(params);
    if (queryToast) show(queryToast);
    return () => window.removeEventListener("aijou:toast", onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;
  const Icon = toast.kind === "error" ? CircleAlert : toast.kind === "info" ? Info : CheckCircle2;
  return (
    <div className={`app-toast ${toast.kind ?? "success"}`} role={toast.kind === "error" ? "alert" : "status"} aria-live="polite">
      <span className="app-toast-icon"><Icon size={19} aria-hidden="true" /></span>
      <span>{toast.message}</span>
      <button type="button" onClick={() => setToast(null)} aria-label="Tutup notifikasi">
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}

export function showToast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent<ToastPayload>("aijou:toast", { detail: { message, kind } }));
}

function toastFromQuery(params: URLSearchParams): ToastPayload | null {
  if (params.get("error")) return { kind: "error", message: "Aksi belum berhasil. Periksa data lalu coba lagi." };
  if (params.get("created")) return { kind: "success", message: "Data baru berhasil dibuat." };
  if (params.get("deleted")) return { kind: "success", message: "Data berhasil dihapus permanen." };
  if (params.get("saved")) return { kind: "success", message: "Perubahan berhasil disimpan." };
  if (params.get("updated")) return { kind: "success", message: "Status berhasil diperbarui." };
  if (params.get("started")) return { kind: "success", message: "Proses berhasil dimulai dan masuk antrean aman." };
  return null;
}
