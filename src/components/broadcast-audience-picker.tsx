"use client";

import { CheckCircle2, ListFilter, Users } from "lucide-react";
import { useState } from "react";

type BroadcastAudience = "manual" | "all_opt_in";

export function BroadcastAudiencePicker(props: { optedInCount: number }) {
  const [audience, setAudience] = useState<BroadcastAudience>("manual");

  return (
    <fieldset className="broadcast-audience-picker">
      <legend>Audience broadcast</legend>
      <div className="broadcast-audience-options">
        <label className={audience === "manual" ? "broadcast-audience-option active" : "broadcast-audience-option"}>
          <input
            type="radio"
            name="audience"
            value="manual"
            checked={audience === "manual"}
            onChange={() => setAudience("manual")}
          />
          <span>
            <strong><ListFilter size={15} /> Nomor tertentu</strong>
            <small>Pilih nomor satu per baris untuk campaign ini.</small>
          </span>
        </label>
        <label className={audience === "all_opt_in" ? "broadcast-audience-option active" : "broadcast-audience-option"}>
          <input
            type="radio"
            name="audience"
            value="all_opt_in"
            checked={audience === "all_opt_in"}
            onChange={() => setAudience("all_opt_in")}
          />
          <span>
            <strong><Users size={15} /> Semua kontak opt-in</strong>
            <small>{props.optedInCount} kontak terdaftar. Kontak yang opt-out atau masih cooldown akan dilewati otomatis.</small>
          </span>
        </label>
      </div>

      {audience === "manual" ? (
        <label>
          Nomor tujuan
          <small>Format 08, 628, +62, spasi, dan strip dinormalisasi otomatis. Kontak wajib sudah tercatat dengan opt-in marketing.</small>
          <textarea name="phoneNumbers" rows={6} required placeholder={"081234567890\n+62 898-7654-321"} />
        </label>
      ) : (
        <div className="broadcast-audience-all">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>
            <strong>Siap mengirim ke semua kontak opt-in</strong>
            <small>Daftar penerima dicek ulang saat campaign dimulai supaya consent dan cooldown tetap aman.</small>
          </span>
        </div>
      )}
    </fieldset>
  );
}
