"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { startNewWhatsAppChatAction } from "@/app/conversations/actions";
import { ApprovedWhatsAppTemplatePicker, type ApprovedWhatsAppTemplatePickerOption } from "@/components/approved-whatsapp-template-picker";
import { FormSubmitButton } from "@/components/form-submit-button";

type ApprovedWhatsAppTemplates = {
  templates: ApprovedWhatsAppTemplatePickerOption[];
  error: string | null;
};

export function NewWhatsAppChatLauncher(props: {
  approvedWhatsAppTemplates: ApprovedWhatsAppTemplates;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(props.initialOpen));
  const canSend = props.approvedWhatsAppTemplates.templates.length > 0;
  const close = () => {
    setOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.get("new") === "1") {
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url);
    }
  };

  return (
    <>
      <button
        className="primary-button chat-new-conversation-button"
        type="button"
        onClick={() => setOpen(true)}
      >
        <Plus size={16} aria-hidden="true" />
        Chat nomor baru
      </button>

      {open ? (
        <div className="ops-modal-backdrop" role="presentation">
          <form
            action={startNewWhatsAppChatAction}
            aria-labelledby="new-whatsapp-chat-title"
            aria-modal="true"
            className="ops-modal compact"
            role="dialog"
          >
            <header className="ops-modal-head">
              <div>
                <p className="eyebrow">Percakapan baru</p>
                <h2 id="new-whatsapp-chat-title">Chat nomor baru</h2>
              </div>
              <button
                className="ops-modal-close-button"
                type="button"
                aria-label="Tutup Chat nomor baru"
                onClick={close}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </header>

            <div className="ops-modal-body">
              <p className="muted">
                Mulai percakapan WhatsApp dengan template yang sudah disetujui Meta.
              </p>
              <label>
                Nama customer <span className="optional-label">opsional</span>
                <input name="displayName" type="text" maxLength={160} placeholder="Contoh: Bapak Andi" />
              </label>
              <label>
                Nomor WhatsApp
                <input
                  name="phoneNumber"
                  type="tel"
                  inputMode="tel"
                  maxLength={24}
                  placeholder="08 / +62 / 62812xxxxxxx"
                  required
                />
                <small>08, +62, 62, spasi, dan strip diterima lalu dinormalisasi otomatis.</small>
              </label>
              <ApprovedWhatsAppTemplatePicker {...props.approvedWhatsAppTemplates} />
            </div>

            <footer className="ops-modal-footer">
              <FormSubmitButton
                className="primary-button"
                disabled={!canSend}
                label="Kirim template & buka chat"
                pendingLabel="Membuka chat…"
              />
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}
