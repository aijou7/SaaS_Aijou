import {
  ArrowRight,
  BookOpenText,
  Check,
  CircleDot,
  Globe2,
  Hand,
  MessageSquareText,
  Send,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { AijouLogo } from "@/components/aijou-logo";

const capabilities = [
  {
    icon: MessageSquareText,
    number: "01",
    title: "Satu inbox, konteks tetap utuh",
    description:
      "Percakapan dari web dan Telegram masuk ke ruang kerja yang sama. Tim tidak perlu menebak ulang kebutuhan calon pelanggan.",
  },
  {
    icon: BookOpenText,
    number: "02",
    title: "Jawaban bersumber dari bisnis Anda",
    description:
      "Aijou belajar dari profil bisnis, katalog, FAQ, dan knowledge base yang Anda kelola sendiri dari dashboard.",
  },
  {
    icon: Hand,
    number: "03",
    title: "Manusia masuk saat dibutuhkan",
    description:
      "Ambil alih percakapan kapan saja, beri catatan internal, lalu kembalikan ke otomatisasi setelah urusan selesai.",
  },
  {
    icon: WalletCards,
    number: "04",
    title: "Tindak lanjut tidak berhenti di chat",
    description:
      "Ubah percakapan menjadi lead, proposal, transaksi, dan payment link tanpa memindahkan pekerjaan ke banyak alat.",
  },
];

const workflow = [
  {
    label: "Siapkan konteks",
    detail: "Isi profil bisnis, produk, harga, dan jawaban yang harus dijadikan acuan.",
  },
  {
    label: "Hubungkan kanal",
    detail: "Pasang widget web atau sambungkan bot Telegram langsung dari halaman Integrations.",
  },
  {
    label: "Kerjakan bersama",
    detail: "Aijou menangani pertanyaan rutin; tim mengambil alih percakapan penting dari inbox.",
  },
];

const channels = [
  { name: "Web Live Chat", note: "Siap digunakan", state: "live", icon: Globe2 },
  { name: "Telegram", note: "Siap digunakan", state: "live", icon: Send },
  {
    name: "WhatsApp",
    note: "Siap setelah Meta menyetujui",
    state: "ready",
    icon: MessageSquareText,
  },
  { name: "Instagram", note: "Segera hadir", state: "soon", icon: CircleDot },
  { name: "Messenger", note: "Segera hadir", state: "soon", icon: CircleDot },
  { name: "Gmail", note: "Segera hadir", state: "soon", icon: CircleDot },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <Link className="landing-brand" href="/" aria-label="Aijou AI — beranda">
          <AijouLogo size={36} />
          <span>
            <strong>Aijou</strong>
            <small>Customer workspace</small>
          </span>
        </Link>

        <nav className="landing-nav" aria-label="Navigasi utama">
          <a href="#product">Produk</a>
          <a href="#workflow">Cara kerja</a>
          <a href="#channels">Integrasi</a>
        </nav>

        <div className="landing-actions">
          <Link className="landing-link" href="/login">
            Masuk
          </Link>
          <Link className="landing-button" href="/signup">
            Daftar beta
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-kicker">
            <span /> Private beta dibuka
          </p>
          <h1 id="landing-title">
            Chat masuk.
            <br />
            <em>Konteks tersimpan.</em>
            <br />
            Tim tetap memegang kendali.
          </h1>
          <p className="landing-hero-lead">
            Aijou menyatukan percakapan, pengetahuan bisnis, lead, dan tindak lanjut dalam
            satu ruang kerja. Otomatis untuk hal rutin, manusia untuk keputusan penting.
          </p>
          <div className="landing-cta-row">
            <Link className="landing-primary" href="/signup">
              Mulai gratis
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a className="landing-secondary" href="#product">
              Lihat cara kerjanya
            </a>
          </div>
          <p className="landing-cta-note">Daftar langsung · Tanpa kartu kredit · Cocok untuk uji coba tim kecil</p>
        </div>

        <div className="landing-product-stage" aria-label="Contoh alur kerja Aijou">
          <div className="landing-stage-mark" aria-hidden="true">A</div>
          <div className="landing-inbox-card">
            <div className="landing-inbox-head">
              <div>
                <span className="landing-live-dot" />
                <strong>Inbox</strong>
              </div>
              <small>Web Live Chat</small>
            </div>
            <div className="landing-contact-row">
              <span className="landing-avatar">RB</span>
              <div>
                <strong>Raka — Bumi Villa</strong>
                <small>Butuh jaringan untuk 38 bangunan…</small>
              </div>
              <span className="landing-time">09.42</span>
            </div>
            <div className="landing-chat-preview">
              <div className="landing-message customer">
                Budget sekitar 250 juta, perangkat belum ada.
              </div>
              <div className="landing-message assistant">
                Baik, berarti kita mulai dari desain jaringan. Supaya estimasinya akurat,
                boleh kirim denah area dan perkiraan tamu saat okupansi penuh?
              </div>
            </div>
            <div className="landing-takeover-row">
              <span><UserRound size={15} aria-hidden="true" /> Perlu survey teknis</span>
              <strong>Ambil alih</strong>
            </div>
          </div>

          <div className="landing-context-card">
            <span>Langkah berikutnya</span>
            <strong>Jadwalkan survey lokasi</strong>
            <div>
              <small>Lead</small>
              <small>Proposal</small>
              <small>Follow-up</small>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-outcome-strip" aria-label="Nilai utama produk">
        <p>BUKAN SEKADAR BALAS OTOMATIS</p>
        <div>
          <span><Check size={15} aria-hidden="true" /> Riwayat 24 jam</span>
          <span><Check size={15} aria-hidden="true" /> Human takeover</span>
          <span><Check size={15} aria-hidden="true" /> Lead & proposal</span>
          <span><Check size={15} aria-hidden="true" /> Payment workflow</span>
        </div>
      </section>

      <section className="landing-section" id="product">
        <div className="landing-section-heading landing-heading-row">
          <div>
            <p className="landing-eyebrow">Ruang kerja pelanggan</p>
            <h2>Satu alur yang bisa dipahami seluruh tim.</h2>
          </div>
          <p>
            Bukan kumpulan demo AI. Setiap fitur dibuat untuk memindahkan percakapan ke
            langkah bisnis berikutnya—dengan jejak yang jelas di dashboard.
          </p>
        </div>

        <div className="landing-capability-grid">
          {capabilities.map((item) => {
            const Icon = item.icon;
            return (
              <article className="landing-capability-card" key={item.number}>
                <div className="landing-capability-top">
                  <span>{item.number}</span>
                  <Icon size={21} strokeWidth={1.7} aria-hidden="true" />
                </div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-workflow" id="workflow">
        <div className="landing-workflow-intro">
          <p className="landing-eyebrow">Mulai tanpa proyek panjang</p>
          <h2>Dari nol ke inbox aktif dalam tiga langkah.</h2>
          <p>
            Konfigurasi dilakukan dari webapp. Anda tetap menentukan sumber pengetahuan,
            batas otomatisasi, dan kapan tim harus masuk.
          </p>
          <Link href="/signup">
            Buat workspace <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <ol className="landing-workflow-list">
          {workflow.map((item, index) => (
            <li key={item.label}>
              <span>0{index + 1}</span>
              <div>
                <h3>{item.label}</h3>
                <p>{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-channels" id="channels">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Integrasi, apa adanya</p>
          <h2>Pakai yang sudah siap. Yang lain tidak kami pura-purakan.</h2>
          <p>
            Web Live Chat dan Telegram dapat langsung dikonfigurasi. WhatsApp menunggu
            persetujuan Meta; kanal lain tetap ditandai segera hadir.
          </p>
        </div>
        <div className="landing-channel-grid">
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <article className={`landing-channel-card ${channel.state}`} key={channel.name}>
                <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                <div>
                  <strong>{channel.name}</strong>
                  <small>{channel.note}</small>
                </div>
                <span>{channel.state === "live" ? "LIVE" : channel.state === "ready" ? "READY" : "SOON"}</span>
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-final-card">
        <div className="landing-final-copy">
          <ShieldCheck size={24} aria-hidden="true" />
          <p>PRIVATE BETA</p>
          <h2>Mulai dari chat yang benar-benar masuk hari ini.</h2>
          <span>
            Buat workspace, isi konteks bisnis, lalu coba langsung lewat web atau Telegram.
          </span>
        </div>
        <div className="landing-final-action">
          <Link className="landing-primary landing-primary-light" href="/signup">
            Daftar dan mulai gratis
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <small>Sudah punya akun? <Link href="/login">Masuk di sini</Link></small>
        </div>
      </section>

      <footer className="landing-footer">
        <Link className="landing-brand" href="/">
          <AijouLogo size={30} />
          <span><strong>Aijou</strong><small>by Aijou Teknologi Digital</small></span>
        </Link>
        <p>Teknologi yang siap menggerakkan bisnis.</p>
        <div>
          <Link href="/signup">Daftar beta</Link>
          <Link href="/login">Masuk</Link>
        </div>
      </footer>
    </main>
  );
}
