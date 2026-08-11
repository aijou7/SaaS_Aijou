import {
  ArrowRight,
  Building2,
  Check,
  GraduationCap,
  HeartPulse,
  Hotel,
  MessageCircleMore,
  Plane,
  Send,
  ShoppingBag,
  Store,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { AijouLogo } from "@/components/aijou-logo";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingPricing } from "@/components/marketing-pricing";
import { getPublicTrialAvailability } from "@/server/subscriptions/subscriptions";

export const dynamic = "force-dynamic";

const industries = [
  { icon: Hotel, title: "Hotel & Villa", description: "Jawab tamu, kualifikasi booking, dan teruskan kebutuhan khusus." },
  { icon: Store, title: "Retail & E-commerce", description: "Jawab produk, harga, stok, dan arahkan pelanggan ke transaksi." },
  { icon: UtensilsCrossed, title: "F&B", description: "Tangani pertanyaan menu, reservasi, dan permintaan pelanggan." },
  { icon: HeartPulse, title: "Kesehatan", description: "Jawab informasi umum dan arahkan jadwal ke petugas yang tepat." },
  { icon: GraduationCap, title: "Pendidikan", description: "Layani calon siswa, pertanyaan program, dan proses pendaftaran." },
  { icon: Building2, title: "Jasa Profesional", description: "Kualifikasi kebutuhan dan ubah percakapan menjadi lead." },
  { icon: Plane, title: "Tour & Travel", description: "Jawab itinerary, paket, serta kebutuhan wisatawan lintas waktu." },
  { icon: ShoppingBag, title: "UMKM", description: "Mulai dari satu inbox tanpa menambah banyak alat kerja." },
];

const workflowSteps = [
  { title: "Isi konteks bisnis", description: "Masukkan profil, layanan, produk, harga, FAQ, dan aturan penting." },
  { title: "Hubungkan channel", description: "Aktifkan widget web, Telegram, atau WhatsApp resmi Meta." },
  { title: "Kerjakan bersama", description: "AI menjawab yang rutin, manusia mengambil keputusan penting." },
];

export default async function LandingPage() {
  const trialAvailability = await getPublicTrialAvailability();
  return (
    <main className="marketing-page">
      <MarketingHeader />

      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <p className="marketing-kicker"><span /> AI customer workspace dari Lombok</p>
          <h1>
            Setiap chat datang
            <br />
            dengan <em>konteks.</em>
          </h1>
          <p>
            Aijou membantu bisnis menjawab pelanggan, menjaga riwayat kebutuhan, dan
            membawa percakapan ke langkah berikutnya—tanpa mengambil kendali dari manusia.
          </p>
          <div className="marketing-cta-row">
            <Link className="marketing-button" href="/signup">
              Mulai gratis <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <Link className="marketing-button ghost" href="/features">Jelajahi fitur</Link>
          </div>
          <div className="marketing-proof-row">
            <span><Check size={14} /> Tanpa kartu kredit</span>
            <span><Check size={14} /> Human takeover</span>
            <span><Check size={14} /> WhatsApp resmi Meta</span>
          </div>
        </div>

        <div className="marketing-stage" aria-label="Contoh percakapan dan tindak lanjut di Aijou">
          <div className="marketing-stage-orbit one" aria-hidden="true" />
          <div className="marketing-stage-orbit two" aria-hidden="true" />
          <div className="marketing-channel-chip web"><MessageCircleMore size={15} /> Web chat</div>
          <div className="marketing-channel-chip whatsapp"><MessageCircleMore size={15} /> WhatsApp</div>
          <div className="marketing-channel-chip telegram"><Send size={15} /> Telegram</div>
          <div className="marketing-chat-card">
            <header>
              <div><AijouLogo size={28} /><span><strong>Aijou</strong><small>Aktif sekarang</small></span></div>
              <small>AI + HUMAN</small>
            </header>
            <div className="marketing-chat-body">
              <p className="incoming">Saya butuh WiFi untuk villa dengan 38 bangunan. Budget sekitar 250 juta.</p>
              <p className="outgoing">Siap. Untuk skala itu kita mulai dari site survey dan desain jaringan. Ada denah area serta perkiraan jumlah tamu saat penuh?</p>
            </div>
            <footer>
              <span><span /> Lead teridentifikasi</span>
              <button type="button">Ambil alih</button>
            </footer>
          </div>
          <div className="marketing-next-card">
            <span>LANGKAH BERIKUTNYA</span>
            <strong>Jadwalkan site survey</strong>
            <small>Owner · Hari ini</small>
          </div>
        </div>
      </section>

      <section className="marketing-trust-strip" aria-label="Channel yang didukung">
        <p>SATU RUANG KERJA UNTUK</p>
        <div><span>WhatsApp</span><i /> <span>Web Live Chat</span><i /> <span>Telegram</span><i /> <span>AI + Tim Manusia</span></div>
      </section>

      <section className="marketing-industries" id="industries">
        <div className="marketing-section-head">
          <div><p className="marketing-eyebrow">Dibentuk mengikuti bisnis</p><h2>Satu fondasi, banyak cara melayani.</h2></div>
          <p>Atur knowledge, tone, alur lead, dan handoff sesuai jenis usaha—bukan memakai jawaban generik untuk semua pelanggan.</p>
        </div>
        <div className="marketing-industry-grid">
          {industries.map(({ icon: Icon, title, description }) => (
            <article key={title}><span><Icon size={19} /></span><div><h3>{title}</h3><p>{description}</p></div></article>
          ))}
        </div>
      </section>

      <section className="marketing-workflow" id="workflow">
        <div className="marketing-workflow-copy">
          <p className="marketing-eyebrow">Mulai tanpa proyek panjang</p>
          <h2>Tiga langkah menuju inbox yang lebih teratur.</h2>
          <p>Mulai kecil, uji dengan percakapan nyata, lalu aktifkan channel ketika jawaban dan alurnya sudah sesuai.</p>
          <Link href="/signup">Buat workspace <ArrowRight size={16} /></Link>
        </div>
        <ol>
          {workflowSteps.map((step, index) => (
            <li key={step.title}><span>0{index + 1}</span><div><h3>{step.title}</h3><p>{step.description}</p></div></li>
          ))}
        </ol>
      </section>

      <MarketingPricing trialAvailability={trialAvailability} />

      <section className="marketing-final">
        <div><p>PRIVATE BETA</p><h2>Bawa satu percakapan nyata. Lihat bagaimana Aijou menanganinya.</h2></div>
        <Link className="marketing-button light" href="/signup">Mulai gratis <ArrowRight size={17} /></Link>
      </section>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/"><AijouLogo size={30} /><span><strong>Aijou AI</strong><small>by Aijou Teknologi Digital</small></span></Link>
        <p>Dibangun dari Lombok untuk bisnis Indonesia.</p>
        <div><Link href="/login">Masuk</Link><Link href="/signup">Daftar beta</Link></div>
      </footer>
    </main>
  );
}
