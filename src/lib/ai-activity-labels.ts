type AiActivityCopy = {
  title: string;
  description: string;
};

const ACTION_COPY: Record<string, AiActivityCopy> = {
  lead_summary_upserted: {
    title: "Ringkasan calon pelanggan diperbarui",
    description: "Kebutuhan dan potensi pelanggan sudah dirangkum.",
  },
  customer_service_reply_created: {
    title: "Pelanggan sudah dibalas",
    description: "Aijou menjawab menggunakan konteks bisnis dan percakapan.",
  },
  customer_media_acknowledged: {
    title: "Lampiran pelanggan diterima",
    description: "Foto atau dokumen sudah diterima dan percakapan dapat dilanjutkan.",
  },
  handoff_reply_created: {
    title: "Percakapan diteruskan ke tim",
    description: "Aijou berhenti membalas agar tim dapat menangani percakapan ini.",
  },
  clarification_requested: {
    title: "Informasi tambahan diminta",
    description: "Aijou memerlukan detail tambahan sebelum melanjutkan.",
  },
  pending_transaction_created: {
    title: "Catatan transaksi dibuat",
    description: "Transaksi menunggu pemeriksaan dan konfirmasi.",
  },
  transaction_confirmed: {
    title: "Transaksi dikonfirmasi",
    description: "Catatan transaksi sudah disetujui.",
  },
  transaction_cancelled: {
    title: "Transaksi dibatalkan",
    description: "Catatan transaksi tidak jadi diproses.",
  },
  confirmation_not_found: {
    title: "Transaksi belum ditemukan",
    description: "Aijou belum menemukan transaksi yang ingin dikonfirmasi.",
  },
  cancellation_not_found: {
    title: "Transaksi belum ditemukan",
    description: "Aijou belum menemukan transaksi yang ingin dibatalkan.",
  },
  receipt_draft_created: {
    title: "Bukti pembayaran diproses",
    description: "Informasi dari bukti pembayaran sudah dibuat sebagai draft.",
  },
  proposal_draft_created: {
    title: "Draft proposal dibuat",
    description: "Aijou menyiapkan draft proposal dari kebutuhan pelanggan.",
  },
  simulator_preview_reply_created: {
    title: "Respons simulasi dibuat",
    description: "Aijou menyelesaikan uji percakapan terbaru.",
  },
};

const INTENT_DESCRIPTIONS: Record<string, string> = {
  lead_summary: "Kebutuhan dan potensi pelanggan sudah dirangkum.",
  customer_service_reply: "Aijou menjawab menggunakan konteks bisnis dan percakapan.",
  customer_service: "Aijou menjawab menggunakan konteks bisnis yang tersedia.",
  customer_service_preview: "Respons dibuat untuk menguji cara Aijou menjawab.",
  customer_media: "Lampiran pelanggan sedang diproses.",
  customer_media_acknowledged: "Lampiran pelanggan sudah diterima.",
  handoff_request: "Percakapan membutuhkan bantuan tim.",
  outside_business_hours: "Pesan masuk di luar jam layanan dan diteruskan sesuai aturan.",
  human_takeover_enabled: "Tim mengambil alih percakapan dari Aijou.",
  human_takeover_released: "Aijou kembali menangani percakapan.",
  conversation_resolved: "Percakapan ditandai selesai.",
  owner_reply: "Tim membalas pelanggan secara langsung.",
  owner_whatsapp_template: "Tim mengirim template WhatsApp yang disetujui Meta.",
  proposal_draft: "Aijou menyiapkan draft proposal.",
  proposal_follow_up: "Proposal dijadwalkan untuk ditindaklanjuti.",
  receipt_extract: "Informasi pada bukti pembayaran sedang dibaca.",
  expense_create: "Aijou mengenali permintaan pencatatan transaksi.",
  expense_confirm: "Aijou mengenali konfirmasi transaksi.",
  expense_cancel: "Aijou mengenali pembatalan transaksi.",
  expense_summary: "Aijou mengenali permintaan ringkasan transaksi.",
  correction_request: "Pelanggan meminta informasi diperbaiki.",
  unknown: "Aijou memerlukan konteks tambahan untuk memahami permintaan.",
};

export function getAiActivityCopy(actionTaken: string, intent: string): AiActivityCopy {
  const normalizedAction = actionTaken.trim().toLowerCase();
  const normalizedIntent = intent.trim().toLowerCase();
  const known = ACTION_COPY[normalizedAction];

  if (known) return known;

  return {
    title: humanizeActivityKey(normalizedAction || normalizedIntent),
    description:
      INTENT_DESCRIPTIONS[normalizedIntent] ??
      "Aijou menyelesaikan satu langkah berdasarkan percakapan terbaru.",
  };
}

export function formatAiConfidence(score: number | null) {
  if (score === null) return "Belum dinilai";
  return `Yakin ${Math.round(score * 100)}%`;
}

function humanizeActivityKey(value: string) {
  if (!value || value === "-") return "Aktivitas percakapan diperbarui";

  const replacements: Record<string, string> = {
    acknowledged: "diterima",
    assistant: "Aijou",
    cancelled: "dibatalkan",
    confirmed: "dikonfirmasi",
    conversation: "percakapan",
    created: "dibuat",
    customer: "pelanggan",
    draft: "draft",
    enabled: "diaktifkan",
    handoff: "diteruskan ke tim",
    lead: "calon pelanggan",
    media: "lampiran",
    owner: "tim",
    pending: "menunggu",
    proposal: "proposal",
    receipt: "bukti pembayaran",
    released: "dikembalikan ke Aijou",
    reply: "balasan",
    requested: "diminta",
    resolved: "diselesaikan",
    service: "layanan",
    summary: "ringkasan",
    transaction: "transaksi",
    upserted: "diperbarui",
  };
  const words = value
    .split("_")
    .filter(Boolean)
    .map((word) => replacements[word] ?? word);
  const label = words.join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}
