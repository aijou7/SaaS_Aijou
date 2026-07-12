import {
  Bot,
  KeyRound,
  Mail,
  MessageCircle,
  Music2,
  RadioTower,
  Send,
  ShieldCheck,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  disconnectTelegramAction,
  saveTelegramSettingsAction,
  testTelegramConnectionAction,
} from "@/app/telegram/actions";
import { updateWhatsAppSettingsAction } from "@/app/whatsapp/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getIntegrationWorkspaceSummary } from "@/server/integrations/overview";
import { getTelegramSettingsForUser } from "@/server/telegram/settings";
import { getWhatsAppSettingsPage } from "@/server/whatsapp/settings";

type IntegrationsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const platforms = [
  { key: "telegram", label: "Telegram", icon: Send, className: "telegram" },
  { key: "live-chat", label: "Web Live Chat", icon: MessageCircle, className: "live-chat" },
  { key: "whatsapp", label: "WhatsApp Business", icon: RadioTower, className: "whatsapp" },
  { key: "messenger", label: "Messenger", icon: MessageCircle, className: "messenger" },
  { key: "instagram", label: "Instagram", icon: Send, className: "instagram" },
  { key: "gmail", label: "Gmail", icon: Mail, className: "gmail" },
  { key: "other-email", label: "Other Email", icon: Mail, className: "email" },
  { key: "tiktok", label: "TikTok", icon: Music2, className: "tiktok" },
] as const;

const availablePlatforms = new Set(["telegram", "live-chat", "whatsapp"]);

export default async function IntegrationsPage({ searchParams }: IntegrationsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedPlatform = getSingleParam(resolvedSearchParams.platform);
  const selectedPlatform = platforms.some((platform) => platform.key === requestedPlatform)
    ? requestedPlatform
    : undefined;
  const whatsAppPage =
    selectedPlatform === "whatsapp" ? await getWhatsAppSettingsPage(session.userId) : null;
  const telegramPage =
    selectedPlatform === "telegram" ? await getTelegramSettingsForUser(session.userId) : null;
  const workspace =
    selectedPlatform !== "whatsapp" && selectedPlatform !== "telegram"
      ? await getIntegrationWorkspaceSummary(session.userId, selectedPlatform === "live-chat")
      : null;
  const businessName =
    whatsAppPage?.business?.businessName ??
    telegramPage?.business?.businessName ??
    workspace?.businessName;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const widgetKey = workspace?.widgetKey ?? "";
  const widgetSnippet = `<script src="${appUrl}/aijou-widget.js" data-workspace="${widgetKey}" defer></script>`;
  const whatsAppWebhookUrl =
    whatsAppPage?.settings?.webhookUrl ?? `${appUrl}/api/webhooks/whatsapp`;
  const telegramFeedback = getTelegramFeedback(resolvedSearchParams);

  return (
    <AppShell
      active={selectedPlatform === "telegram" ? "telegram" : "integrations"}
      businessName={businessName}
    >
      <section className="core-page">
        <div className="core-hero">
          <div>
            <p className="eyebrow">Integrations</p>
            <h1>Satu inbox untuk channel tempat klien chat.</h1>
            <p>
              Telegram, web live chat, dan WhatsApp memakai agent, knowledge, lead pipeline,
              serta human takeover dari workspace yang sama.
            </p>
          </div>
        </div>

        <div className="platform-picker">
          <div className="platform-picker-header">
            <div>
              <h2>Platform</h2>
              <p>Pilih channel yang ingin disambungkan ke inbox Aijou.</p>
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
                  <small>{getPlatformStatus(platform.key, selectedPlatform, { telegramPage, whatsAppPage, workspace })}</small>
                </Link>
              );
            })}
          </div>
        </div>

        {selectedPlatform && !availablePlatforms.has(selectedPlatform) ? (
          <div className="platform-coming-soon">
            <div>
              <strong>{platforms.find((platform) => platform.key === selectedPlatform)?.label} belum aktif</strong>
              <p>Channel ini tetap ada di roadmap. Telegram, web chat, dan WhatsApp tersedia sekarang.</p>
            </div>
            <Link className="primary-button" href="/integrations?platform=telegram">
              Connect Telegram
            </Link>
          </div>
        ) : null}

        {selectedPlatform === "live-chat" ? (
          <section className="platform-setup-card">
            <div className="feature-card-title">
              <div>
                <h2>Web Live Chat</h2>
                <p className="muted">Sesi 24 jam otomatis masuk ke inbox serta lead pipeline.</p>
              </div>
              <span className={workspace?.websiteUrl ? "status" : "status status-warning"}>
                {workspace?.websiteUrl ? "Ready" : "Set domain dulu"}
              </span>
            </div>
            <div className="env-list">
              <div className="env-row">
                <code>Allowed origin</code>
                <span>{workspace?.websiteUrl ?? "Belum diisi"}</span>
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

        {selectedPlatform === "telegram" && telegramPage?.settings ? (
          <section className="platform-setup-card">
            <div className="feature-card-title">
              <div>
                <h2>Telegram Bot</h2>
                <p className="muted">
                  Webhook didaftarkan otomatis. Beta mendukung chat teks pribadi dengan bot.
                </p>
              </div>
              <span className={telegramPage.readiness ? "status" : "status status-warning"}>
                {telegramPage.readiness ? "Connected" : telegramPage.settings.configured ? "Inactive" : "Not set"}
              </span>
            </div>

            {telegramFeedback ? (
              <div className="settings-note" role={telegramFeedback.isError ? "alert" : "status"}>
                <strong>{telegramFeedback.title}</strong>
                <p>{telegramFeedback.message}</p>
              </div>
            ) : null}

            {telegramPage.settings.lastError && !telegramFeedback ? (
              <div className="settings-note" role="status">
                <strong>Koneksi terakhir perlu dicek</strong>
                <p>Bot tetap tersimpan. Jalankan tes koneksi untuk memastikan webhook sudah sehat.</p>
              </div>
            ) : null}

            {!telegramFeedback && telegramPage.settings.lastError && !telegramPage.readiness ? (
              <div className="settings-note" role="alert">
                <strong>Koneksi terakhir perlu diperiksa</strong>
                <p>Jalankan tes koneksi atau simpan ulang token dari @BotFather.</p>
              </div>
            ) : null}

            <div className="telegram-connection-grid" aria-label="Telegram connection summary">
              <div>
                <Bot size={18} aria-hidden="true" />
                <span>
                  <small>Bot</small>
                  <strong>
                    {telegramPage.settings.botUsername
                      ? `@${telegramPage.settings.botUsername}`
                      : "Belum terhubung"}
                  </strong>
                </span>
              </div>
              <div>
                <KeyRound size={18} aria-hidden="true" />
                <span>
                  <small>Bot token</small>
                  <strong>{telegramPage.settings.botTokenMasked ?? "Belum disimpan"}</strong>
                </span>
              </div>
              <div>
                <ShieldCheck size={18} aria-hidden="true" />
                <span>
                  <small>Terakhir tersambung</small>
                  <strong>{formatTelegramDate(telegramPage.settings.lastConnectedAt)}</strong>
                </span>
              </div>
            </div>

            <form className="form-grid" action={saveTelegramSettingsAction}>
              <label className="span-2">
                Bot token dari @BotFather
                <input
                  name="botToken"
                  type="password"
                  autoComplete="off"
                  maxLength={256}
                  spellCheck={false}
                  placeholder={
                    telegramPage.settings.configured
                      ? `Tersimpan: ${telegramPage.settings.botTokenMasked}`
                      : "123456789:AA..."
                  }
                />
                <small>Kosongkan untuk mempertahankan token yang sudah tersimpan.</small>
              </label>
              <label className="span-2">
                Webhook URL
                <input value={telegramPage.settings.webhookUrl ?? ""} readOnly />
              </label>
              <label className="checkbox-label span-2">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={telegramPage.settings.isActive}
                />
                Aktifkan AI reply dan human takeover untuk Telegram
              </label>
              <button className="primary-button span-2" type="submit">
                Simpan pengaturan Telegram
              </button>
            </form>

            <div className="telegram-action-row">
              <form action={testTelegramConnectionAction}>
                <button
                  className="ghost-button"
                  type="submit"
                  disabled={!telegramPage.settings.isActive}
                >
                  Tes koneksi aktif
                </button>
              </form>
              <form action={disconnectTelegramAction}>
                <button
                  className="danger-button telegram-disconnect-button"
                  type="submit"
                  disabled={!telegramPage.settings.isActive}
                >
                  Putuskan webhook
                </button>
              </form>
              <small>Disconnect menonaktifkan bot tanpa menampilkan atau menghapus token terenkripsi.</small>
            </div>

            <div className="settings-note">
              <strong>Setup aman</strong>
              <p>
                Buat bot lewat @BotFather, lalu paste token hanya di dashboard login ini. Jangan kirim
                token lewat chat. Grup, channel, file, dan media belum diproses pada fase beta.
              </p>
              <a
                className="ghost-button telegram-botfather-link"
                href="https://t.me/BotFather"
                target="_blank"
                rel="noreferrer"
              >
                Buka @BotFather
              </a>
            </div>
          </section>
        ) : null}

        {selectedPlatform === "telegram" && telegramPage && !telegramPage.settings ? (
          <section className="platform-setup-card">
            <div className="settings-note" role="alert">
              <strong>Workspace bisnis belum tersedia</strong>
              <p>Lengkapi onboarding bisnis sebelum menyambungkan bot Telegram.</p>
            </div>
            <Link className="primary-button" href="/business">
              Lengkapi profil bisnis
            </Link>
          </section>
        ) : null}

        {selectedPlatform === "whatsapp" && whatsAppPage ? (
          <section className="platform-setup-card">
            <div className="feature-card-title">
              <h2>WhatsApp Business setup</h2>
              <span className={whatsAppPage.ready ? "status" : "status status-warning"}>
                {whatsAppPage.ready ? "Connected" : "Draft"}
              </span>
            </div>
            <form className="form-grid" action={updateWhatsAppSettingsAction}>
              <label>
                Phone Number ID
                <input name="phoneNumberId" type="text" defaultValue={whatsAppPage.settings?.phoneNumberId ?? ""} />
              </label>
              <label>
                Webhook URL
                <input name="webhookUrl" type="text" defaultValue={whatsAppWebhookUrl} />
              </label>
              <label className="span-2">
                Access Token
                <input
                  name="accessToken"
                  type="password"
                  placeholder={`Current: ${whatsAppPage.settings?.accessTokenMasked ?? "Not set"}`}
                />
              </label>
              <label>
                Verify Token
                <input
                  name="verifyToken"
                  type="password"
                  placeholder={`Current: ${whatsAppPage.settings?.verifyTokenMasked ?? "Not set"}`}
                />
              </label>
              <label>
                App Secret
                <input
                  name="appSecret"
                  type="password"
                  placeholder={`Current: ${whatsAppPage.settings?.appSecretMasked ?? "Not set"}`}
                />
              </label>
              <label className="checkbox-label span-2">
                <input name="isActive" type="checkbox" defaultChecked={whatsAppPage.settings?.isActive} />
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

function getPlatformStatus(
  platform: (typeof platforms)[number]["key"],
  selectedPlatform: string | undefined,
  pages: {
    telegramPage: Awaited<ReturnType<typeof getTelegramSettingsForUser>> | null;
    whatsAppPage: Awaited<ReturnType<typeof getWhatsAppSettingsPage>> | null;
    workspace: Awaited<ReturnType<typeof getIntegrationWorkspaceSummary>> | null;
  },
) {
  if (!availablePlatforms.has(platform)) return "Coming soon";
  if (platform !== selectedPlatform) return "Tersedia";
  if (platform === "telegram") return pages.telegramPage?.readiness ? "Connected" : "Setup";
  if (platform === "whatsapp") return pages.whatsAppPage?.ready ? "Connected" : "Setup";
  return pages.workspace?.websiteUrl ? "Ready" : "Setup";
}

function getTelegramFeedback(searchParams: Record<string, string | string[] | undefined>) {
  if (getSingleParam(searchParams.saved) === "1") {
    return {
      title: "Pengaturan Telegram tersimpan",
      message: "Identitas bot diverifikasi dan pengaturan koneksi sudah diperbarui.",
      isError: false,
    };
  }

  if (getSingleParam(searchParams.tested) === "1") {
    return {
      title: "Koneksi Telegram sehat",
      message: "Bot token valid dan webhook aktif sesuai workspace ini.",
      isError: false,
    };
  }

  if (getSingleParam(searchParams.disconnected) === "1") {
    return {
      title: "Telegram dinonaktifkan",
      message: "Webhook telah diputus. Token tetap terenkripsi agar mudah disambungkan kembali.",
      isError: false,
    };
  }

  const error = getSingleParam(searchParams.error);
  const errorMessages: Record<string, string> = {
    invalid_token: "Bot token tidak valid. Salin token terbaru langsung dari @BotFather.",
    webhook_failed: "Telegram dapat dijangkau, tetapi webhook belum berhasil didaftarkan. Coba lagi.",
    telegram_unavailable: "Telegram sedang tidak dapat dijangkau. Tunggu sebentar lalu tes ulang.",
    incomplete: "Simpan bot token yang valid sebelum mengaktifkan atau mengetes koneksi.",
    save_failed: "Pengaturan belum berhasil disimpan. Periksa input lalu coba lagi.",
  };

  if (!error || !errorMessages[error]) return null;

  return {
    title: "Koneksi Telegram belum berhasil",
    message: errorMessages[error],
    isError: true,
  };
}

function formatTelegramDate(value: string | null) {
  if (!value) return "Belum pernah";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Belum pernah";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
