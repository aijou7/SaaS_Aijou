"use client";

import { useState } from "react";

export function WidgetSnippetCopy({
  snippet,
  enabled,
}: {
  snippet: string;
  enabled: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="span-2">
      <label>
        Embed sebelum penutup &lt;/body&gt;
        <textarea value={snippet} readOnly rows={4} spellCheck={false} />
      </label>
      <div className="quick-actions">
        <button
          className="ghost-button"
          type="button"
          onClick={copySnippet}
          disabled={!enabled}
        >
          {status === "copied" ? "Snippet tersalin" : "Salin snippet"}
        </button>
        <small aria-live="polite">
          {status === "failed"
            ? "Copy otomatis ditolak browser. Blok teks di atas lalu salin manual."
            : enabled
              ? "Setelah deploy, buka website dan kirim satu chat percobaan."
              : "Simpan domain website terlebih dahulu."}
        </small>
      </div>
    </div>
  );
}
