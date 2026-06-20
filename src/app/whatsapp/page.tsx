import { KeyRound, PlugZap, RadioTower, ShieldCheck } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { updateWhatsAppSettingsAction } from "@/app/whatsapp/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getWhatsAppSettingsPage } from "@/server/whatsapp/settings";

export default async function WhatsAppSettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getWhatsAppSettingsPage(session.userId);
  const webhookUrl =
    page.settings?.webhookUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/whatsapp`;

  return (
    <AppShell active="whatsapp" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">WhatsApp connection</p>
        <h1>Sambungin WhatsApp dari dashboard, tanpa buka code.</h1>
        <p>
          Isi credential Meta WhatsApp Cloud API di sini. App akan pakai setting dashboard
          lebih dulu, lalu fallback ke `.env` kalau belum ada.
        </p>
      </section>

      <section className="grid" aria-label="WhatsApp settings summary">
        <div className="card">
          <PlugZap size={22} aria-hidden="true" />
          <h2>Status</h2>
          <div className="metric">{page.ready ? "Ready" : "Draft"}</div>
          <p className="muted">
            {page.settings?.isActive ? "Dashboard settings aktif." : "Belum aktif."}
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
          <div className="metric">{page.settings?.verifyToken ? "Token set" : "Missing"}</div>
          <p className="muted">Verify token dan app secret untuk Meta webhook.</p>
        </div>
      </section>

      <section className="section split-layout">
        <div className="card">
          <h2>Connection Settings</h2>
          <form className="form-grid" action={updateWhatsAppSettingsAction}>
            <label>
              Phone Number ID
              <input
                name="phoneNumberId"
                type="text"
                defaultValue={page.settings?.phoneNumberId ?? ""}
                placeholder="1234567890"
              />
            </label>
            <label>
              Webhook URL
              <input name="webhookUrl" type="text" defaultValue={webhookUrl} />
            </label>
            <label className="span-2">
              Access Token
              <input
                name="accessToken"
                type="password"
                placeholder={`Current: ${page.settings?.accessTokenMasked ?? "Not set"}`}
              />
            </label>
            <label>
              Verify Token
              <input
                name="verifyToken"
                type="password"
                placeholder={`Current: ${page.settings?.verifyTokenMasked ?? "Not set"}`}
              />
            </label>
            <label>
              App Secret
              <input
                name="appSecret"
                type="password"
                placeholder={`Current: ${page.settings?.appSecretMasked ?? "Not set"}`}
              />
            </label>
            <label className="checkbox-label span-2">
              <input name="isActive" type="checkbox" defaultChecked={page.settings?.isActive} />
              Activate dashboard WhatsApp settings
            </label>
            <button className="primary-button span-2" type="submit">
              Save WhatsApp settings
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
                <small>Access token, phone number ID, verify token, dan app secret.</small>
              </span>
            </div>
            <div className="checklist-item">
              <RadioTower size={18} aria-hidden="true" />
              <span>
                <strong>2. Set callback URL</strong>
                <small>Pakai URL webhook di form: `/api/webhooks/whatsapp`.</small>
              </span>
            </div>
            <div className="checklist-item">
              <PlugZap size={18} aria-hidden="true" />
              <span>
                <strong>3. Activate</strong>
                <small>Centang active setelah semua field lengkap, lalu cek Go Live.</small>
              </span>
            </div>
          </div>
          <div className="settings-note">
            <strong>Catatan security MVP</strong>
            <p>
              Credential disimpan di database lokal. Untuk production SaaS nanti sebaiknya
              dienkripsi per tenant sebelum disimpan.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
