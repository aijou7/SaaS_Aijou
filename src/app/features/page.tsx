import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { AijouLogo } from "@/components/aijou-logo";
import { MarketingFeatureIcon } from "@/components/marketing-feature-icon";
import { MarketingHeader } from "@/components/marketing-header";
import { marketingFeatureCategories, marketingFeatures } from "@/lib/marketing-features";

export const metadata: Metadata = {
  title: "Fitur Aijou AI",
  description:
    "Jelajahi fitur Aijou AI untuk percakapan, pelanggan, otomatisasi, dan operasional bisnis.",
};

export default function FeaturesPage() {
  return (
    <main className="marketing-page features-index-page">
      <MarketingHeader />

      <section className="features-index-hero">
        <p className="marketing-kicker"><span /> Fitur yang sudah dapat dipakai</p>
        <h1>Satu workspace dari chat sampai operasional.</h1>
        <p>
          Pilih fitur untuk melihat manfaat, cara kerja, dan bagian workspace yang
          mengaturnya. Tidak ada fitur coming soon yang ditampilkan sebagai fitur aktif.
        </p>
        <div className="marketing-proof-row">
          <span><Check size={14} /> WhatsApp resmi Meta</span>
          <span><Check size={14} /> Web chat dan Telegram</span>
          <span><Check size={14} /> AI tetap bisa diambil alih tim</span>
        </div>
      </section>

      <section className="features-index-directory" aria-label="Daftar fitur Aijou AI">
        {marketingFeatureCategories.map((category) => (
          <div className="features-index-group" key={category}>
            <header>
              <p>{category}</p>
              <span>{marketingFeatures.filter((feature) => feature.category === category).length} fitur</span>
            </header>
            <div>
              {marketingFeatures
                .filter((feature) => feature.category === category)
                .map((feature) => (
                  <Link href={`/features/${feature.slug}`} key={feature.slug}>
                    <span><MarketingFeatureIcon name={feature.icon} size={20} /></span>
                    <div><strong>{feature.navTitle}</strong><p>{feature.summary}</p></div>
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                ))}
            </div>
          </div>
        ))}
      </section>

      <section className="marketing-final">
        <div><p>PRIVATE BETA</p><h2>Uji Aijou dengan percakapan bisnis Anda sendiri.</h2></div>
        <Link className="marketing-button light" href="/signup">
          Mulai gratis <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/"><AijouLogo size={30} /><span><strong>Aijou AI</strong><small>by Aijou Teknologi Digital</small></span></Link>
        <p>Dibangun dari Lombok untuk bisnis Indonesia.</p>
        <div><Link href="/login">Masuk</Link><Link href="/signup">Daftar beta</Link></div>
      </footer>
    </main>
  );
}
