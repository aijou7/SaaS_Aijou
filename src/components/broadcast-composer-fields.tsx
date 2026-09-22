"use client";

import { useState } from "react";
import { ApprovedWhatsAppTemplatePicker, type ApprovedWhatsAppTemplatePickerOption } from "@/components/approved-whatsapp-template-picker";
import { BroadcastAudiencePicker, type BroadcastAudience } from "@/components/broadcast-audience-picker";

export function BroadcastComposerFields(props: {
  optedInCount: number;
  recentChatCount: number;
  templates: ApprovedWhatsAppTemplatePickerOption[];
  templateError: string | null;
}) {
  const [audience, setAudience] = useState<BroadcastAudience>("manual");

  return (
    <>
      <BroadcastAudiencePicker
        audience={audience}
        onAudienceChange={setAudience}
        optedInCount={props.optedInCount}
        recentChatCount={props.recentChatCount}
      />
      {audience === "recent_chat_consent" ? null : (
        <>
          <ApprovedWhatsAppTemplatePicker templates={props.templates} error={props.templateError} />
          <label>
            Parameter body <small>satu nilai per baris, maksimal 10</small>
            <textarea name="bodyParameters" rows={5} placeholder={"Nama pelanggan\nKode promo"} />
          </label>
        </>
      )}
    </>
  );
}
