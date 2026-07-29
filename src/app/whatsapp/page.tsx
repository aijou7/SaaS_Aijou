import { KeyRound, PlugZap, RadioTower, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { updateWhatsAppSettingsAction } from "@/app/whatsapp/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getWhatsAppSettingsPage } from "@/server/whatsapp/settings";

type WhatsAppSettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WhatsAppSettingsPage({
  searchParams,
}: WhatsAppSettingsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getWhatsAppSettingsPage(session.userId);
  const params = searchParams ? await searchParams : {};
  const feedback = getWhatsAppFeedback(params);
  const webhookUrl =
    page.settings?.webhookUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/whatsapp`;

  return (
    <AppShell active="whatsapp" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">WhatsApp connection</p>
        <h1>Sambungin WhatsApp dari dashboard, tanpa buka code.</h1>
        <p>
          Isi credential Meta WhatsApp Cloud API di sini. Aijou akan memvalidasi akun,
          mencocokkan nomor, dan memasang webhook workspace secara otomatis.
        </p>
      </section>

      {feedback ? (
        <section className="section">
          <div className="settings-note" role={feedback.isError ? "alert" : "status"}>
            <strong>{feedback.title}</strong>
            <p>{feedback.message}</p>
          </div>
        </section>
      ) : null}

      <section className="grid" aria-label="WhatsApp settings summary">
        <div className="card">
          <PlugZap size={22} aria-hidden="true" />
          <h2>Status</h2>
          <div className="metric">{page.ready ? "Ready" : "Draft"}</div>
          <p className="muted">
            {page.settings?.isActive
              ? `Diverifikasi ${formatConnectionDate(page.settings.lastConnectedAt)}.`
              : "Belum aktif atau belum lolos tes Meta."}
          </p>
        </div>
        <div className="card">
          <RadioTower size={22} aria-hidden="true" />
          <h2>Phone Number ID</h2>
          <div className="metric">{page.settings?.phoneNumberId ?? "-"}</div>
          <p className="muted">ID nomor WhatsApp Cloud API.</p>
        </div>
        <div className="card">
          <ShieldCheck size={22} aria-hidden="true" />
          <h2>Webhook</h2>
          <div className="metric">{page.settings?.verifyTokenSet ? "Token set" : "Missing"}</div>
          <p className="muted">Verify token dan app secret untuk Meta webhook.</p>
        </div>
      </section>

      <section className="section split-layout">
        <div className="card">
          <h2>Connection Settings</h2>
          {page.configurationIssue ? (
            <div className="settings-note" role="alert">
              {page.configurationIssue}
            </div>
          ) : null}
          <form
            className="form-grid"
            action={updateWhatsAppSettingsAction}
            autoComplete="off"
          >
            <input name="returnTo" type="hidden" value="/whatsapp" />
            <label>
              WhatsApp Business Account ID
              <input
                name="wabaId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{5,32}"
                defaultValue={page.settings?.wabaId ?? ""}
                required
                placeholder="123456789012345"
              />
            </label>
            <label>
              Phone Number ID
              <input
                name="phoneNumberId"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{5,32}"
                defaultValue={page.settings?.phoneNumberId ?? ""}
                required
                placeholder="1234567890"
              />
            </label>
            <label>
              Webhook URL
              <input name="webhookUrl" type="url" value={webhookUrl} readOnly />
              <small>Dipasang otomatis ke subscription WABA saat koneksi berhasil.</small>
            </label>
            <label className="span-2">
              Access Token
              <input
                name="accessToken"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={4096}
                required={!page.settings?.accessTokenSet}
                placeholder={`Current: ${page.settings?.accessTokenMasked ?? "Not set"}`}
              />
            </label>
            <label>
              Verify Token <small>(opsional)</small>
              <input
                name="verifyToken"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={4096}
                placeholder={`Current: ${page.settings?.verifyTokenMasked ?? "Not set"}`}
              />
              <small>Kosongkan agar Aijou membuat token acak yang aman.</small>
            </label>
            <label>
              App Secret
              <input
                name="appSecret"
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                maxLength={4096}
                required={!page.settings?.appSecretSet}
                placeholder={`Current: ${page.settings?.appSecretMasked ?? "Not set"}`}
              />
              <small>Ambil dari Meta for Developers, App settings, Basic, lalu App Secret.</small>
            </label>
            <label className="checkbox-label span-2">
              <input name="isActive" type="checkbox" defaultChecked={page.settings?.isActive} />
              Aktifkan dan verifikasi koneksi ke Meta
            </label>
            <button className="primary-button span-2" type="submit">
              Simpan &amp; tes koneksi Meta
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Meta setup guide</h2>
          <div className="checklist">
            <div className="checklist-item">
              <KeyRound size={18} aria-hidden="true" />
              <span>
                <strong>1. Copy token dari Meta</strong>
                <small>Siapkan permanent access token, WABA ID, Phone Number ID, dan app secret.</small>
              </span>
            </div>
            <div className="checklist-item">
              <RadioTower size={18} aria-hidden="true" />
              <span>
                <strong>2. Set callback URL</strong>
                <small>Aijou memasang callback HTTPS dan verify token otomatis ke WABA.</small>
              </span>
            </div>
            <div className="checklist-item">
              <PlugZap size={18} aria-hidden="true" />
              <span>
                <strong>3. Activate</strong>
                <small>Centang aktif lalu simpan. Status Ready hanya muncul setelah Meta menerima setup.</small>
              </span>
            </div>
          </div>
          <div className="settings-note">
            <strong>Security</strong>
            <p>
              Credential dienkripsi per workspace sebelum disimpan. Jangan pernah membagikan
              access token, verify token, app secret, atau encryption key lewat chat.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Production diagnostics</p>
            <h2>Status traffic WhatsApp terbaru</h2>
          </div>
        </div>
        <div className="grid">
          <div className="card">
            <h3>Inbound terakhir</h3>
            <p className="metric">
              {formatConnectionDate(page.diagnostics.lastInboundAt)}
            </p>
            <small>Pesan customer terakhir yang diterima webhook.</small>
          </div>
          <div className="card">
            <h3>Outbound terakhir</h3>
            <p className="metric">
              {page.diagnostics.lastOutboundStatus ?? "Belum ada"}
            </p>
            <small>
              {page.diagnostics.lastOutboundAt
                ? formatConnectionDate(page.diagnostics.lastOutboundAt)
                : "Belum ada pesan keluar."}
            </small>
          </div>
          <div className="card">
            <h3>Gagal 24 jam</h3>
            <p className="metric">
              {page.diagnostics.failedMessagesLast24h}
            </p>
            <small>
              {page.diagnostics.lastOutboundError ||
                page.diagnostics.lastWebhookError ||
                "Tidak ada error provider terbaru."}
            </small>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function getWhatsAppFeedback(searchParams: Record<string, string | string[] | undefined>) {
  const saved = getSingleParam(searchParams.saved);
  if (saved === "1") {
    const connected = getSingleParam(searchParams.connected) === "1";
    return {
      title: connected ? "WhatsApp terhubung" : "Draft WhatsApp tersimpan",
      message: connected
        ? "Token valid, nomor cocok dengan WABA, dan webhook workspace sudah diterima Meta."
        : "Credential terenkripsi sudah disimpan, tetapi channel belum diaktifkan.",
      isError: false,
    };
  }

  const error = getSingleParam(searchParams.error);
  const messages: Record<string, string> = {
    invalid_token: "Access token ditolak Meta. Gunakan permanent System User Access Token terbaru.",
    invalid_app_secret: "App Secret tidak cocok dengan Meta app yang menerbitkan access token.",
    invalid_verify_token: "Verify Token minimal 16 karakter. Kosongkan kolom agar Aijou membuat token acak yang aman.",
    credential_recovery:
      "Credential lama tidak dapat dibaca. Isi ulang WABA ID, Phone Number ID, access token, dan app secret; Verify Token boleh kosong.",
    encryption_unavailable: "Konfigurasi enkripsi server belum siap. Hubungi admin workspace.",
    phone_in_use: "Phone Number ID ini sudah digunakan oleh workspace lain.",
    storage_unavailable: "Database sementara tidak dapat dijangkau. Coba lagi sebentar.",
    permission_missing:
      "Token belum memiliki izin whatsapp_business_management dan whatsapp_business_messaging.",
    invalid_waba: "WABA ID tidak ditemukan atau tidak dapat diakses oleh token ini.",
    phone_mismatch: "Phone Number ID tidak terdaftar di WABA ID yang dimasukkan.",
    webhook_failed:
      "Meta mengenali akun, tetapi subscription webhook belum berhasil. Periksa izin token dan coba lagi.",
    meta_unavailable: "Meta sedang tidak dapat dijangkau. Credential tetap Draft; coba lagi sebentar.",
    incomplete: "Lengkapi WABA ID, Phone Number ID, access token, dan app secret.",
    save_failed: "Pengaturan belum berhasil disimpan. Periksa input lalu coba lagi.",
  };

  if (!error || !messages[error]) return null;
  return {
    title: "WhatsApp belum terhubung",
    message: messages[error],
    isError: true,
  };
}

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatConnectionDate(value: string | null) {
  if (!value) return "sekarang";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "sekarang";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
