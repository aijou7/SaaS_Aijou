"use client";

import { ImagePlus, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;

export type EditableMessageTemplate = {
  id: string;
  name: string;
  purpose: string;
  languageCode: string;
  title: string | null;
  body: string;
  headerImageUrl: string | null;
};

type MessageTemplateBuilderProps = {
  action: ServerAction;
  initialTemplate?: EditableMessageTemplate;
  imageUploadReady?: boolean;
};

export function MessageTemplateBuilder({ action, initialTemplate, imageUploadReady = true }: MessageTemplateBuilderProps) {
  const isEditing = Boolean(initialTemplate);
  const [title, setTitle] = useState(initialTemplate?.title ?? "");
  const [body, setBody] = useState(initialTemplate?.body ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialTemplate?.headerImageUrl ?? null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  return (
    <section className="message-template-builder-grid">
      <div className="card message-template-form-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">{isEditing ? "Edit draft" : "Template baru"}</p>
            <h2>{isEditing ? "Edit template" : "Buat template"}</h2>
            <p className="muted">Gunakan nama kecil dengan underscore, lalu isi komponen yang akan dikirim ke pelanggan.</p>
          </div>
        </div>
        <form className="form-grid" action={action} encType="multipart/form-data">
          {initialTemplate ? <input type="hidden" name="templateId" value={initialTemplate.id} /> : null}
          <label>
            Nama template
            <input name="name" type="text" defaultValue={initialTemplate?.name} pattern="[a-z0-9_]{1,512}" maxLength={512} placeholder="konfirmasi_jadwal_survei" required />
            <small>Huruf kecil, angka, dan underscore.</small>
          </label>
          <label>
            Tujuan pesan
            <select name="purpose" defaultValue={initialTemplate?.purpose ?? "UTILITY"} required>
              <option value="UTILITY">Utility — update layanan</option>
              <option value="MARKETING">Marketing — promosi</option>
              <option value="AUTHENTICATION">Authentication — kode akses</option>
            </select>
          </label>
          <label>
            Bahasa
            <input name="languageCode" type="text" defaultValue={initialTemplate?.languageCode ?? "id"} pattern="[a-z]{2,3}(_[A-Z]{2})?" maxLength={12} required />
            <small>Contoh: id atau en_US.</small>
          </label>
          <label>
            Judul <span className="optional-label">opsional</span>
            <input name="title" type="text" maxLength={60} placeholder="Contoh: Coba Aijou AI Gratis" value={title} disabled={Boolean(previewUrl)} onChange={(event) => setTitle(event.target.value)} />
            <small>{previewUrl ? "Header Meta memakai gambar, jadi judul teks dinonaktifkan." : "Maksimal 60 karakter, tanpa variabel."}</small>
          </label>
          <label className="span-2">
            Isi pesan
            <textarea name="body" rows={8} maxLength={1024} placeholder="Halo {{1}}, jadwal survei kamu sudah kami catat untuk {{2}}." required value={body} onChange={(event) => setBody(event.target.value)} />
            <small>Maksimal 1.024 karakter. Variabel gunakan format {"{{1}}"}, {"{{2}}"}, dan seterusnya.</small>
          </label>
          <div className="span-2">
            <span className="field-label">Gambar header <span className="optional-label">opsional</span></span>
            <label className="template-upload-zone">
              <input
                name="headerImage"
                type="file"
                accept="image/jpeg,image/png"
                disabled={!imageUploadReady}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setPreviewUrl(file ? URL.createObjectURL(file) : null);
                  if (file) setTitle("");
                }}
              />
              {previewUrl ? (
                <img src={previewUrl} alt="Preview gambar header template" />
              ) : (
                <>
                  <ImagePlus size={22} aria-hidden="true" />
                  <strong>Tambah gambar</strong>
                  <span>JPG atau PNG · maksimal 5 MB</span>
                </>
              )}
            </label>
            {previewUrl ? (
              <button
                className="template-image-remove"
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  const input = document.querySelector<HTMLInputElement>('input[name="headerImage"]');
                  if (input) input.value = "";
                }}
              >
                Hapus gambar
              </button>
            ) : null}
            {initialTemplate?.headerImageUrl ? <input type="hidden" name="removeHeaderImage" value={!previewUrl ? "on" : ""} /> : null}
            <small className={imageUploadReady ? "field-hint" : "field-hint field-hint-warning"}>
              {imageUploadReady
                ? "Gambar akan tampil di bagian atas pesan WhatsApp."
                : "Upload gambar belum aktif. Tambahkan BLOB_READ_WRITE_TOKEN di Vercel Environment Variables."}
            </small>
          </div>
          <div className="form-actions span-2">
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden="true" />
              {isEditing ? "Simpan perubahan" : "Simpan sebagai draft"}
            </button>
            {isEditing ? <Link className="ghost-button" href="/message-templates">Batal edit</Link> : null}
          </div>
        </form>
      </div>

      <div className="card message-template-preview-card">
        <div className="section-header">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>Contoh pesan</h2>
            <p className="muted">Preview berubah langsung saat isi template atau gambar diubah.</p>
          </div>
          <ImagePlus size={20} aria-hidden="true" />
        </div>
        <div className="template-phone-preview">
          <div className="template-phone-topbar"><span /> <strong>Aijou AI</strong></div>
          <div className="template-phone-message">
            {previewUrl ? <img className="template-phone-image" src={previewUrl} alt="Preview header" /> : <div className="template-preview-placeholder"><ImagePlus size={22} aria-hidden="true" /><span>Gambar header opsional</span></div>}
            {title ? <strong>{title}</strong> : <strong className="template-preview-fallback">Judul opsional</strong>}
            <p>{body || "Isi pesan template akan muncul di sini setelah kamu mulai mengetik."}</p>
            <small>Aijou AI · aijou.site</small>
          </div>
        </div>
        <div className="template-preview-note">
          <strong>Catatan Meta</strong>
          <p>Simpan sebagai draft dulu, lalu klik “Ajukan ke Meta” di template yang tersimpan untuk memulai review WhatsApp Manager.</p>
        </div>
      </div>
    </section>
  );
}
