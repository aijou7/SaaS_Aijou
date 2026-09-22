"use client";

import { CheckCircle2, ListFilter, Users } from "lucide-react";

export type BroadcastAudience = "manual" | "all_opt_in" | "recent_chat_consent";

export function BroadcastAudiencePicker(props: {
  audience: BroadcastAudience;
  onAudienceChange: (audience: BroadcastAudience) => void;
  optedInCount: number;
  recentChatCount: number;
}) {
  const { audience } = props;

  return (
    <fieldset className="broadcast-audience-picker">
      <legend>Audience broadcast</legend>
      <input type="hidden" name="audience" value={audience} />
      <div className="broadcast-audience-options">
        <label className={audience === "manual" ? "broadcast-audience-option active" : "broadcast-audience-option"}>
          <input
            type="radio"
            value="manual"
            checked={audience === "manual"}
            onChange={() => props.onAudienceChange("manual")}
          />
          <span>
            <strong><ListFilter size={15} /> Nomor tertentu</strong>
            <small>Pilih nomor satu per baris untuk campaign ini.</small>
          </span>
        </label>
        <label className={audience === "all_opt_in" ? "broadcast-audience-option active" : "broadcast-audience-option"}>
          <input
            type="radio"
            value="all_opt_in"
            checked={audience === "all_opt_in"}
            onChange={() => props.onAudienceChange("all_opt_in")}
          />
          <span>
            <strong><Users size={15} /> Semua kontak opt-in</strong>
            <small>{props.optedInCount} kontak terdaftar. Kontak yang opt-out atau masih cooldown akan dilewati otomatis.</small>
          </span>
        </label>
        <label className={audience === "recent_chat_consent" ? "broadcast-audience-option active" : "broadcast-audience-option"}>
          <input
            type="radio"
            value="recent_chat_consent"
            checked={audience === "recent_chat_consent"}
            onChange={() => props.onAudienceChange("recent_chat_consent")}
          />
          <span>
            <strong><CheckCircle2 size={15} /> Minta izin promo</strong>
            <small>{props.recentChatCount} customer yang chat dalam 24 jam terakhir. Pesan ini tidak berisi promo; customer harus membalas YA PROMO dulu.</small>
          </span>
        </label>
      </div>

      {audience === "manual" ? (
        <label>
          Nomor tujuan
          <small>Format 08, 628, +62, spasi, dan strip dinormalisasi otomatis. Kontak wajib sudah tercatat dengan opt-in marketing.</small>
          <textarea name="phoneNumbers" rows={6} required placeholder={"081234567890\n+62 898-7654-321"} />
        </label>
      ) : audience === "all_opt_in" ? (
        <div className="broadcast-audience-all">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>
            <strong>Siap mengirim ke semua kontak opt-in</strong>
            <small>Daftar penerima dicek ulang saat campaign dimulai supaya consent dan cooldown tetap aman.</small>
          </span>
        </div>
      ) : (
        <div className="broadcast-consent-preview">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>
            <strong>Permintaan izin tanpa promo</strong>
            <small>Pesan: “Boleh kami mengirim info dan promo lewat WhatsApp? Balas YA PROMO untuk setuju atau TIDAK PROMO untuk menolak. Balas STOP kapan saja untuk berhenti.”</small>
          </span>
        </div>
      )}
    </fieldset>
  );
}
