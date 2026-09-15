"use client";

import { useId, useState } from "react";

export type ApprovedWhatsAppTemplatePickerOption = {
  name: string;
  languageCode: string;
  title: string | null;
  body: string;
};

type ApprovedWhatsAppTemplatePickerProps = {
  templates: ApprovedWhatsAppTemplatePickerOption[];
  error: string | null;
};

function getTemplateKey(template: ApprovedWhatsAppTemplatePickerOption) {
  return `${template.name}::${template.languageCode}`;
}

export function ApprovedWhatsAppTemplatePicker({
  templates,
  error,
}: ApprovedWhatsAppTemplatePickerProps) {
  const selectId = useId();
  const [selectedKey, setSelectedKey] = useState("");
  const selectedTemplate = templates.find(
    (template) => getTemplateKey(template) === selectedKey,
  );

  return (
    <div className="approved-template-picker span-2">
      <label htmlFor={selectId}>
        <span>Pilih template WhatsApp approved</span>
        <select
          id={selectId}
          name="templateKey"
          value={selectedKey}
          onChange={(event) => setSelectedKey(event.target.value)}
          required
          disabled={templates.length === 0}
        >
          <option value="" disabled>
            {templates.length > 0
              ? "Pilih template yang sudah disetujui"
              : "Belum ada template approved"}
          </option>
          {templates.map((template) => (
            <option key={getTemplateKey(template)} value={getTemplateKey(template)}>
              {template.name} · {template.languageCode}
              {template.title ? ` — ${template.title}` : ""}
            </option>
          ))}
        </select>
      </label>
      {selectedTemplate ? (
        <div className="approved-template-preview" aria-label="Preview template WhatsApp">
          <div className="approved-template-preview-head">
            <span>Preview pesan</span>
            <small>{selectedTemplate.languageCode}</small>
          </div>
          <div className="approved-template-preview-bubble">
            {selectedTemplate.title ? <strong>{selectedTemplate.title}</strong> : null}
            <p>{selectedTemplate.body}</p>
            <small>Template approved Meta</small>
          </div>
          {selectedTemplate.body.includes("{{") ? (
            <p className="approved-template-preview-note">
              Template ini memiliki variabel seperti <code>{"{{1}}"}</code>. Meta tetap membutuhkan nilainya saat dikirim.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="approved-template-empty" role="status">
          Pilih template untuk melihat preview pesan.
        </div>
      )}
      {templates.length === 0 ? (
        <div className="settings-note span-2" role={error ? "alert" : "status"}>
          <strong>{error ? "Template Meta belum bisa dimuat" : "Belum ada template approved"}</strong>
          <p>
            {error ??
              "Buat template dan tunggu persetujuan Meta di halaman Template WhatsApp sebelum mengirimnya."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
