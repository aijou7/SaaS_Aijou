"use client";

import { useState } from "react";

export type ApprovedWhatsAppTemplatePickerOption = {
  name: string;
  languageCode: string;
  title: string | null;
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
  const [selectedKey, setSelectedKey] = useState("");
  const selectedTemplate = templates.find(
    (template) => getTemplateKey(template) === selectedKey,
  );

  return (
    <>
      <label className="span-2">
        Template WhatsApp approved
        <select
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
        {selectedTemplate ? (
          <small>
            Bahasa: {selectedTemplate.languageCode}
            {selectedTemplate.title ? ` · ${selectedTemplate.title}` : ""}
          </small>
        ) : null}
      </label>
      {templates.length === 0 ? (
        <div className="settings-note span-2" role={error ? "alert" : "status"}>
          <strong>{error ? "Template Meta belum bisa dimuat" : "Belum ada template approved"}</strong>
          <p>
            {error ??
              "Buat template dan tunggu persetujuan Meta di halaman Template WhatsApp sebelum mengirimnya."}
          </p>
        </div>
      ) : null}
    </>
  );
}
