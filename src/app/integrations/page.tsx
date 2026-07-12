import { Mail, MessageCircle, Music2, RadioTower, Send } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateWhatsAppSettingsAction } from "@/app/whatsapp/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";
import { getWhatsAppSettingsPage } from "@/server/whatsapp/settings";

type IntegrationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const platforms = [
  { key: "messenger", label: "Messenger", icon: MessageCircle, className: "messenger" },
  { key: "live-chat", label: "Web Live Chat", icon: MessageCircle, className: "live-chat" },
  { key: "whatsapp", label: "WhatsApp Business", icon: RadioTower, className: "whatsapp" },
  { key: "instagram", label: "Instagram", icon: Send, className: "instagram" },
  { key: "gmail", label: "Gmail", icon: Mail, className: "gmail" },
  { key: "other-email", label: "Other Email", icon: Mail, className: "email" },
  { key: "tiktok", label: "TikTok", icon: Music2, className: "tiktok" },
];

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const selectedPlatform = getSingleParam(resolvedSearchParams.platform);
  const [page, businessProfile] = await Promise.all([
    getWhatsAppSettingsPage(session.userId),
    getBusinessProfilePage(session.userId),
  ]);
  const webhookUrl =
    page.settings?.webhookUrl ??
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/webhooks/whatsapp`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const widgetKey = businessProfile.business?.widgetKey ?? "";
  const widgetSnippet = `<script src="${appUrl}/aijou-widget.js" data-workspace="${widgetKey}" defer></script>`;

  return (
    <AppShell active="integrations" businessName={page.business?.businessName}>
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Integrations</p>
            <h1>Connect semua channel tempat klien chat.</h1>
            <p>
              Target produk: satu AI agent bisa jawab dari WhatsApp, Instagram, Messenger, web
              live chat, email, dan TikTok.
            </p>
          </div>
        </div>

        <div className="platform-picker">
          <div className="platform-picker-header">
            <div>
              <h2>Platform</h2>
              <p>Select the platform you wish to establish your new inbox</p>
            </div>
          </div>
          <div className="platform-grid">
            {platforms.map((platform) => {
              const Icon = platform.icon;
              const isSelected = selectedPlatform === platform.key;

              return (
                <Link
                  className={isSelected ? "platform-card selected" : "platform-card"}
                  href={`/integrations?platform=${platform.key}`}
                  key={platform.key}
                >
                  <span className={`platform-orb ${platform.className}`}>
                    <Icon size={34} aria-hidden="true" />
                  </span>
                  <strong>{platform.label}</strong>
                  {platform.key === "whatsapp" && page.ready ? <small>Connected</small> : null}
                  {platform.key === "live-chat" && businessProfile.business?.websiteUrl ? <small>Ready</small> : null}
                  {platform.key !== "whatsapp" && platform.key !== "live-chat" ? <small>Coming soon</small> : null}
                </Link>
              );
            })}
          </div>
        </div>

        {selectedPlatform && selectedPlatform !== "whatsapp" && selectedPlatform !== "live-chat" ? (
          <div className="platform-coming-soon">
            <div>
              <strong>{platforms.find((platform) => platform.key === selectedPlatform)?.label} belum aktif</strong>
              <p>Slot integrasi sudah disiapkan. Untuk MVP kita aktifkan WhatsApp Business dulu.</p>
            </div>
            <Link className="primary-button" href="/integrations?platform=whatsapp">
              Connect WhatsApp
            </Link>
          </div>
        ) : null}

        {selectedPlatform === "live-chat" ? (
          <section className="platform-setup-card">
            <div className="feature-card-title">
              <div>
                <h2>Web Live Chat</h2>
                <p className="muted">Sesi terenkripsi berlaku 24 jam dan otomatis masuk ke inbox serta lead pipeline.</p>
              </div>
              <span className={businessProfile.business?.websiteUrl ? "status" : "status status-warning"}>
                {businessProfile.business?.websiteUrl ? "Ready" : "Set domain dulu"}
              </span>
            </div>
            <div className="env-list">
              <div className="env-row">
                <code>Allowed origin</code>
                <span>{businessProfile.business?.websiteUrl ?? "Belum diisi"}</span>
              </div>
              <div className="env-row">
                <code>Workspace key</code>
                <span>{widgetKey || "Belum tersedia"}</span>
              </div>
            </div>
            <label className="span-2">
              Embed sebelum penutup &lt;/body&gt;
              <textarea value={widgetSnippet} readOnly rows={4} />
            </label>
            <div className="quick-actions">
              <Link className="ghost-button" href="/business">Atur domain website</Link>
              <Link className="primary-button" href="/simulator">Tes agent</Link>
            </div>
          </section>
        ) : null}

        {selectedPlatform === "whatsapp" ? (
          <section className="platform-setup-card">
            <div className="feature-card-title">
              <h2>WhatsApp Business setup</h2>
              <span className={page.ready ? "status" : "status status-warning"}>
                {page.ready ? "Connected" : "Draft"}
              </span>
            </div>
            <form className="form-grid" action={updateWhatsAppSettingsAction}>
              <label>
                Phone Number ID
                <input name="phoneNumberId" type="text" defaultValue={page.settings?.phoneNumberId ?? ""} />
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
                Activate WhatsApp settings
              </label>
              <button className="primary-button span-2" type="submit">
                Save WhatsApp Business
              </button>
            </form>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}

function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
