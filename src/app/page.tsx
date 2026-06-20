import {
  ArrowRight,
  BadgeCheck,
  Bot,
  CheckCircle2,
  FileText,
  MessageCircle,
  Package,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    icon: MessageCircle,
    title: "Balas chat 24 jam",
    description:
      "AI agent jawab pertanyaan klien, follow up prospek, dan tahu kapan harus handover ke manusia.",
  },
  {
    icon: FileText,
    title: "Training dari dashboard",
    description:
      "Upload knowledge, FAQ, dan percakapan WhatsApp lama dalam format .txt untuk membentuk gaya jawaban AI.",
  },
  {
    icon: Package,
    title: "Produk dan harga",
    description:
      "Masukkan katalog produk atau jasa supaya AI bisa rekomendasi, jelaskan paket, dan bantu closing.",
  },
  {
    icon: WalletCards,
    title: "Payment otomatis",
    description:
      "Siapkan alur Xendit, QRIS, dan payment link agar pembayaran bisa lanjut dari percakapan.",
  },
];

const channels = ["WhatsApp", "Instagram", "Messenger", "Gmail", "Web Live Chat", "TikTok"];

const steps = [
  "Latih AI dengan profil bisnis, produk, dan chat lama.",
  "AI membalas customer dari channel yang tersambung.",
  "AI merekomendasikan produk, menjawab objection, lalu kirim link bayar.",
  "Payment dan laporan masuk dashboard secara otomatis.",
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/">
          <span>
            <Bot size={18} aria-hidden="true" />
          </span>
          Aijou AI
        </Link>
        <nav className="landing-nav" aria-label="Landing navigation">
          <a href="#features">Fitur</a>
          <a href="#workflow">Cara kerja</a>
          <a href="#channels">Platform</a>
        </nav>
        <div className="landing-actions">
          <Link className="landing-link" href="/login">
            Login
          </Link>
          <Link className="landing-button" href="/dashboard">
            Buka dashboard
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-pill">
            <Sparkles size={15} aria-hidden="true" />
            AI sales agent untuk bisnis chat-first
          </div>
          <h1>AI agent yang balas chat, bantu closing, dan catat pembayaran otomatis.</h1>
          <p>
            Bangun customer service yang tetap aktif 24 jam. Latih AI dari dashboard,
            sambungkan platform chat, masukkan produk, lalu biarkan AI membantu customer
            sampai siap bayar.
          </p>
          <div className="landing-cta-row">
            <Link className="landing-primary" href="/login">
              Mulai setup
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a className="landing-secondary" href="#workflow">
              Lihat alur produk
            </a>
          </div>
          <div className="landing-trust-row" aria-label="Highlights">
            <span>
              <CheckCircle2 size={15} aria-hidden="true" />
              Human takeover
            </span>
            <span>
              <CheckCircle2 size={15} aria-hidden="true" />
              Groq AI ready
            </span>
            <span>
              <CheckCircle2 size={15} aria-hidden="true" />
              Xendit-ready flow
            </span>
          </div>
        </div>

        <div className="landing-demo-card" aria-label="Product preview">
          <div className="demo-window-top">
            <span />
            <span />
            <span />
            <strong>Live inbox</strong>
          </div>
          <div className="demo-chat">
            <div className="demo-bubble customer">
              Kak, paket yang cocok buat bisnis kecil apa ya?
            </div>
            <div className="demo-bubble agent">
              Bisa mulai dari paket Starter. Fiturnya sudah termasuk setup AI, FAQ produk,
              dan follow up otomatis. Mau saya bantu buatkan link pembayaran?
            </div>
            <div className="demo-payment">
              <WalletCards size={18} aria-hidden="true" />
              <div>
                <strong>Payment link generated</strong>
                <span>Rp499.000 - Pending payment</span>
              </div>
            </div>
          </div>
          <div className="demo-stats">
            <span>
              <strong>38</strong>
              chats handled
            </span>
            <span>
              <strong>12</strong>
              hot leads
            </span>
            <span>
              <strong>4</strong>
              paid
            </span>
          </div>
        </div>
      </section>

      <section className="landing-section" id="features">
        <div className="landing-section-heading">
          <p className="eyebrow">Core features</p>
          <h2>Fitur yang fokus ke chat sampai closing</h2>
          <p>
            Semua modul dibuat untuk satu tujuan: customer masuk dari chat, AI bantu jawab,
            jualan, bayar, lalu laporan kebaca jelas.
          </p>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article className="landing-feature-card" key={feature.title}>
                <span>
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-workflow" id="workflow">
        <div>
          <p className="eyebrow">Workflow</p>
          <h2>Dari training sampai laporan penjualan</h2>
          <p>
            Mulai dari demo mode dulu, lalu tinggal diganti ke WhatsApp Cloud API dan
            Xendit production saat bisnis siap live.
          </p>
        </div>
        <div className="workflow-list">
          {steps.map((step, index) => (
            <div className="workflow-item" key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section" id="channels">
        <div className="landing-section-heading">
          <p className="eyebrow">Platforms</p>
          <h2>Satu agent untuk banyak channel</h2>
          <p>
            WhatsApp jadi prioritas awal, tapi struktur app sudah disiapkan untuk platform
            lain saat produk makin matang.
          </p>
        </div>
        <div className="channel-grid">
          {channels.map((channel) => (
            <span key={channel}>
              <BadgeCheck size={16} aria-hidden="true" />
              {channel}
            </span>
          ))}
        </div>
      </section>

      <section className="landing-final-card">
        <div>
          <ShieldCheck size={22} aria-hidden="true" />
          <h2>Bangun dulu flow yang bisa didemo, baru integrasi real.</h2>
          <p>
            Landing ini nunjukin arah produknya: AI agent untuk bisnis yang jualan lewat chat,
            bukan dashboard random penuh menu.
          </p>
        </div>
        <Link className="landing-primary" href="/login">
          Masuk ke workspace
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
