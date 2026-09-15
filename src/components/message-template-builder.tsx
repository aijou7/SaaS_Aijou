"use client";

import { ImagePlus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

type ServerAction = (formData: FormData) => void | Promise<void>;

type MessageTemplateBuilderProps = {
  action: ServerAction;
};

export function MessageTemplateBuilder({ action }: MessageTemplateBuilderProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
            <p className="eyebrow">Template baru</p>
            <h2>Buat template</h2>
            <p className="muted">Gunakan nama kecil dengan underscore, lalu isi komponen yang akan dikirim ke pelanggan.</p>
          </div>
        </div>
        <form className="form-grid" action={action} encType="multipart/form-data">
          <label>
            Nama template
            <input name="name" type="text" pattern="[a-z0-9_]{1,512}" maxLength={512} placeholder="konfirmasi_jadwal_survei" required />
            <small>Huruf kecil, angka, dan underscore.</small>
          </label>
          <label>
            Tujuan pesan
            <select name="purpose" defaultValue="UTILITY" required>
              <option value="UTILITY">Utility — update layanan</option>
              <option value="MARKETING">Marketing — promosi</option>
              <option value="AUTHENTICATION">Authentication — kode akses</option>
            </select>
          </label>
          <label>
            Bahasa
            <input name="languageCode" type="text" defaultValue="id" pattern="[a-z]{2,3}(_[A-Z]{2})?" maxLength={12} required />
            <small>Contoh: id atau en_US.</small>
          </label>
          <label>
            Judul <span className="optional-label">opsional</span>
            <input name="title" type="text" maxLength={60} placeholder="Contoh: Coba Aijou AI Gratis" value={title} onChange={(event) => setTitle(event.target.value)} />
            <small>Maksimal 60 karakter, tanpa variabel.</small>
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
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  setPreviewUrl(file ? URL.createObjectURL(file) : null);
                }}
              />
              {previewUrl ? (
                <img src={previewUrl} alt="Preview gambar header template" />
              ) : (
                <>
                  <ImagePlus size={22} aria-hidden="true" />
                  <strong>Tambah gambar</strong>
                  <span>JPG, PNG, atau WEBP · maksimal 5 MB</span>
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
            <small className="field-hint">Gambar akan tampil di bagian atas pesan WhatsApp.</small>
          </div>
          <div className="form-actions span-2">
            <button className="primary-button" type="submit">
              <Plus size={16} aria-hidden="true" />
              Simpan sebagai draft
            </button>
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
          <p>Draft ini belum otomatis diajukan ke WhatsApp Manager. Setelah disimpan, ajukan komponennya melalui Meta untuk mendapatkan status Approved.</p>
        </div>
      </div>
    </section>
  );
}
