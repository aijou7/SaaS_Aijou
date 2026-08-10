import {
  AppWindow,
  Bot,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  KeyRound,
  MessageCircle,
  RadioTower,
  Send,
  ShieldCheck,
  Smartphone,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export const channelSetupLinks = {
  metaBusiness: "https://business.facebook.com/overview",
  metaCreateApp: "https://developers.facebook.com/apps/creation/",
  whatsAppManager: "https://business.facebook.com/wa/manage/home/",
  metaSystemUsers: "https://business.facebook.com/settings/system-users",
  whatsAppDocs: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  botFather: "https://t.me/BotFather",
  telegramDocs: "https://core.telegram.org/bots/tutorial",
} as const;

type SetupStep = {
  title: string;
  description: string;
  done?: boolean;
  current?: boolean;
  icon: LucideIcon;
};

export function WhatsAppSetupGuide(props: {
  credentialsStored: boolean;
  channelReady: boolean;
  inboundDetected: boolean;
  agentActive: boolean;
  compact?: boolean;
}) {
  const steps: SetupStep[] = [
    {
      title: "Siapkan akun dan nomor",
      description:
        "Gunakan akun Facebook yang dapat mengelola bisnis, data bisnis yang valid, dan nomor yang bisa menerima OTP SMS atau telepon. Nomor yang masih aktif di setup WhatsApp lain mungkin perlu dimigrasikan lebih dulu.",
      icon: Smartphone,
      done: props.credentialsStored,
    },
    {
      title: "Buat Meta Business Portfolio",
      description:
        "Buka Meta Business, buat portfolio bisnis, isi nama legal, alamat, website, email bisnis, dan selesaikan verifikasi jika diminta Meta.",
      icon: Building2,
      done: props.credentialsStored,
    },
    {
      title: "Buat aplikasi Meta dan tambahkan WhatsApp",
      description:
        "Masuk ke Meta for Developers, buat app untuk bisnis, lalu tambahkan use case WhatsApp Business Messaging. Hubungkan app ke portfolio bisnis yang benar.",
      icon: AppWindow,
      done: props.credentialsStored,
    },
    {
      title: "Tambahkan nomor dan ambil ID",
      description:
        "Di WhatsApp Manager, tambahkan serta verifikasi nomor. Salin WhatsApp Business Account ID (WABA ID) dan Phone Number ID—bukan nomor telepon biasa.",
      icon: RadioTower,
      done: props.credentialsStored,
    },
    {
      title: "Buat permanent System User Access Token",
      description:
        "Di Business Settings, buat System User, berikan akses ke app dan WABA, lalu buat token dengan izin whatsapp_business_management dan whatsapp_business_messaging.",
      icon: UserCog,
      done: props.credentialsStored,
    },
    {
      title: "Simpan credential di workspace",
      description:
        "Masukkan WABA ID, Phone Number ID, permanent access token, dan App Secret. Verify Token boleh dikosongkan agar dibuat otomatis.",
      done: props.credentialsStored,
      current: !props.credentialsStored,
      icon: KeyRound,
    },
    {
      title: "Validasi dan pasang webhook",
      description:
        "Centang aktivasi lalu simpan. Platform memeriksa token, mencocokkan nomor dengan WABA, dan memasang subscription webhook secara otomatis.",
      done: props.channelReady,
      current: props.credentialsStored && !props.channelReady,
      icon: ShieldCheck,
    },
    {
      title: "Tes pesan masuk dan hidupkan AI",
      description:
        "Kirim pesan dari nomor lain ke nomor bisnis, pastikan chat muncul di Percakapan, lalu aktifkan auto-reply AI. Balasan bebas hanya berlaku dalam customer service window WhatsApp; di luar jendela gunakan template Meta yang disetujui.",
      done: props.inboundDetected && props.agentActive,
      current: props.channelReady && (!props.inboundDetected || !props.agentActive),
      icon: MessageCircle,
    },
  ];

  return (
    <ChannelGuide
      channel="WhatsApp Business"
      description="Dari akun Meta kosong sampai nomor menerima balasan AI di inbox workspace."
      status={props.inboundDetected && props.agentActive ? "Siap dipakai" : "Perlu diselesaikan"}
      steps={steps}
      compact={props.compact}
      links={[
        { label: "Buat Meta Business", href: channelSetupLinks.metaBusiness },
        { label: "Buat aplikasi Meta", href: channelSetupLinks.metaCreateApp, primary: true },
        { label: "Buka WhatsApp Manager", href: channelSetupLinks.whatsAppManager },
        { label: "Buat System User token", href: channelSetupLinks.metaSystemUsers },
        { label: "Panduan resmi Cloud API", href: channelSetupLinks.whatsAppDocs },
      ]}
    />
  );
}

export function TelegramSetupGuide(props: {
  tokenStored: boolean;
  identityVerified: boolean;
  channelReady: boolean;
  agentActive: boolean;
  compact?: boolean;
}) {
  const steps: SetupStep[] = [
    {
      title: "Buka BotFather resmi",
      description:
        "Buka @BotFather di Telegram dan pastikan akun memiliki tanda verifikasi. Jangan mengambil token dari bot atau website lain.",
      icon: ShieldCheck,
      done: props.tokenStored,
    },
    {
      title: "Buat bot dengan /newbot",
      description:
        "Kirim /newbot, isi nama bot yang terlihat pelanggan, lalu buat username unik. Telegram biasanya meminta username berakhiran bot.",
      icon: Bot,
      done: props.tokenStored,
    },
    {
      title: "Salin bot token",
      description:
        "BotFather memberikan token rahasia. Simpan seperti password dan jangan kirim melalui chat, screenshot publik, atau dokumen bersama.",
      icon: KeyRound,
      done: props.tokenStored,
    },
    {
      title: "Simpan token dan aktifkan",
      description:
        "Paste token di workspace, centang aktivasi, lalu simpan. Platform memverifikasi identitas bot dan memasang webhook HTTPS secara otomatis.",
      done: props.tokenStored && props.identityVerified,
      current: !props.tokenStored || !props.identityVerified,
      icon: RadioTower,
    },
    {
      title: "Tes koneksi webhook",
      description:
        "Jalankan Tes koneksi aktif. Status Connected berarti token, identitas bot, dan webhook sudah cocok dengan workspace ini.",
      done: props.channelReady,
      current: props.identityVerified && !props.channelReady,
      icon: CheckCircle2,
    },
    {
      title: "Kirim /start dan tes AI",
      description:
        "Buka username bot, tekan Start atau kirim /start, lalu kirim pertanyaan teks. Pengguna harus memulai chat lebih dulu sebelum bot dapat membalas. Pastikan auto-reply AI juga aktif.",
      done: props.channelReady && props.agentActive,
      current: props.channelReady && !props.agentActive,
      icon: Send,
    },
  ];

  return (
    <ChannelGuide
      channel="Telegram Bot"
      description="BotFather membuat identitas dan token; workspace mengurus validasi serta webhook."
      status={props.channelReady && props.agentActive ? "Siap dipakai" : "Perlu diselesaikan"}
      steps={steps}
      compact={props.compact}
      links={[
        { label: "Buka @BotFather", href: channelSetupLinks.botFather, primary: true },
        { label: "Panduan resmi Telegram", href: channelSetupLinks.telegramDocs },
      ]}
    />
  );
}

export function ChannelOnboardingChoices(props: { onNavigate: () => void }) {
  return (
    <div className="onboarding-channel-launchers" aria-label="Pilih panduan channel pertama">
      <article>
        <span className="channel-launcher-icon"><MessageCircle size={21} aria-hidden="true" /></span>
        <div>
          <strong>Web Live Chat</strong>
          <p>Butuh domain HTTPS dan akses untuk memasang satu snippet script.</p>
        </div>
        <Link href={"/integrations?platform=live-chat" as Route} onClick={props.onNavigate}>
          Setup web chat <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </article>
      <article>
        <span className="channel-launcher-icon"><Send size={21} aria-hidden="true" /></span>
        <div>
          <strong>Telegram Bot</strong>
          <p>Butuh akun Telegram dan bot token dari @BotFather. Webhook dibuat otomatis.</p>
        </div>
        <Link href={"/integrations?platform=telegram" as Route} onClick={props.onNavigate}>
          Panduan Telegram <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </article>
      <article>
        <span className="channel-launcher-icon"><RadioTower size={21} aria-hidden="true" /></span>
        <div>
          <strong>WhatsApp Business</strong>
          <p>Butuh Meta Business, Meta app, WABA, nomor OTP, permanent token, dan App Secret.</p>
        </div>
        <Link href={"/integrations?platform=whatsapp" as Route} onClick={props.onNavigate}>
          Panduan WhatsApp <ExternalLink size={14} aria-hidden="true" />
        </Link>
      </article>
    </div>
  );
}

function ChannelGuide(props: {
  channel: string;
  description: string;
  status: string;
  steps: SetupStep[];
  links: Array<{ label: string; href: string; primary?: boolean }>;
  compact?: boolean;
}) {
  const completed = props.steps.filter((step) => step.done).length;
  return (
    <section className={props.compact ? "channel-setup-guide compact" : "channel-setup-guide"}>
      <header>
        <div>
          <p className="eyebrow">Panduan sampai live</p>
          <h2>{props.channel}</h2>
          <p>{props.description}</p>
        </div>
        <span className={completed === props.steps.length ? "status" : "status status-warning"}>
          {props.status}
        </span>
      </header>

      <div className="channel-guide-progress" aria-label={`${completed} dari ${props.steps.length} langkah terdeteksi`}>
        <span style={{ width: `${Math.round((completed / props.steps.length) * 100)}%` }} />
      </div>

      <div className="channel-official-links" aria-label={`Tautan resmi ${props.channel}`}>
        {props.links.map((link) => (
          <a
            className={link.primary ? "primary-button" : "ghost-button"}
            href={link.href}
            key={link.href}
            target="_blank"
            rel="noreferrer"
          >
            {link.label}
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ))}
      </div>

      <ol className="channel-guide-steps">
        {props.steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li className={step.done ? "done" : step.current ? "current" : undefined} key={step.title}>
              <span className="channel-guide-index" aria-hidden="true">
                {step.done ? <Check size={15} /> : <Circle size={14} />}
              </span>
              <span className="channel-guide-step-icon"><Icon size={18} aria-hidden="true" /></span>
              <div>
                <small>Langkah {index + 1}</small>
                <strong>{step.title}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="channel-security-note">
        <KeyRound size={18} aria-hidden="true" />
        <p><strong>Credential adalah rahasia.</strong> Masukkan token hanya di dashboard workspace. Platform menyimpannya terenkripsi per workspace dan tidak pernah menampilkannya kembali secara utuh.</p>
      </div>
    </section>
  );
}
