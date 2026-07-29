import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  BookOpenText,
  Check,
  ContactRound,
  CreditCard,
  Hand,
  Layers3,
  MessageCircleMore,
  Sparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AijouLogo } from "@/components/aijou-logo";
import {
  getMarketingFeature,
  marketingFeatures,
  type MarketingFeature,
} from "@/lib/marketing-features";

type FeaturePageProps = {
  params: Promise<{ slug: string }>;
};

const featureIcons = {
  bot: Bot,
  whatsapp: MessageCircleMore,
  layers: Layers3,
  book: BookOpenText,
  wand: Sparkles,
  hand: Hand,
  contact: ContactRound,
  pipeline: Workflow,
  payment: CreditCard,
} satisfies Record<MarketingFeature["icon"], typeof Bot>;

export function generateStaticParams() {
  return marketingFeatures.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const feature = getMarketingFeature((await params).slug);

  if (!feature) return {};

  return {
    title: { absolute: `${feature.title} | Aijou AI` },
    description: feature.summary,
  };
}

export default async function FeaturePage({ params }: FeaturePageProps) {
  const feature = getMarketingFeature((await params).slug);
  if (!feature) notFound();

  const Icon = featureIcons[feature.icon];
  const related = marketingFeatures
    .filter((item) => item.slug !== feature.slug)
    .sort((a, b) => Number(b.category === feature.category) - Number(a.category === feature.category))
    .slice(0, 3);

  return (
    <main className="marketing-page feature-page">
      <header className="marketing-header">
        <Link className="marketing-brand" href="/" aria-label="Aijou AI — beranda">
          <AijouLogo size={36} />
          <span><strong>Aijou AI</strong><small>Customer workspace</small></span>
        </Link>
        <nav aria-label="Navigasi utama">
          <Link href="/#features">Fitur</Link>
          <Link href="/#industries">Industri</Link>
          <Link href="/#workflow">Cara kerja</Link>
        </nav>
        <div className="marketing-header-actions">
          <Link href="/login">Masuk</Link>
          <Link className="marketing-button compact" href="/signup">
            Coba gratis <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section className="feature-hero">
        <div className="feature-hero-glow" aria-hidden="true" />
        <div className="feature-breadcrumb">
          <Link href="/"><ArrowLeft size={14} /> Beranda</Link>
          <span>/</span>
          <Link href="/#features">Fitur</Link>
          <span>/</span>
          <strong>{feature.navTitle}</strong>
        </div>
        <div className="feature-hero-content">
          <div>
            <p className="marketing-kicker"><Icon size={15} /> {feature.eyebrow}</p>
            <h1>{feature.hero}</h1>
            <p>{feature.summary}</p>
            <div className="marketing-cta-row">
              <Link className="marketing-button" href="/signup">
                Buat workspace <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link className="marketing-button ghost" href="/#features">
                Lihat semua fitur
              </Link>
            </div>
          </div>
          <div className="feature-visual" aria-label={`Ringkasan fitur ${feature.navTitle}`}>
            <div className="feature-visual-head">
              <span><Icon size={18} /> {feature.navTitle}</span>
              <small>AKTIF</small>
            </div>
            <div className="feature-visual-body">
              <span className="feature-signal"><span /> Konteks pelanggan diterima</span>
              <strong>{feature.title}</strong>
              <p>{feature.description}</p>
              <div>
                {feature.outcomes.map((outcome) => (
                  <span key={outcome.title}><Check size={14} /> {outcome.title}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="feature-intro">
        <p>KENAPA FITUR INI PENTING</p>
        <h2>{feature.description}</h2>
      </section>

      <section className="feature-outcomes" aria-label="Manfaat fitur">
        {feature.outcomes.map((outcome, index) => (
          <article key={outcome.title}>
            <span>0{index + 1}</span>
            <h3>{outcome.title}</h3>
            <p>{outcome.description}</p>
          </article>
        ))}
      </section>

      <section className="feature-steps">
        <div>
          <p className="marketing-eyebrow">Cara kerjanya</p>
          <h2>Mulai tanpa proses yang berbelit.</h2>
          <span>Semua pengaturan utama tersedia dari workspace Aijou.</span>
        </div>
        <ol>
          {feature.steps.map((step, index) => (
            <li key={step.title}>
              <span>{index + 1}</span>
              <div><h3>{step.title}</h3><p>{step.description}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="feature-related">
        <div className="feature-related-head">
          <div><p className="marketing-eyebrow">Jelajahi Aijou</p><h2>Fitur yang bekerja bersamanya.</h2></div>
          <Link href="/#features">Semua fitur <ArrowRight size={15} /></Link>
        </div>
        <div className="feature-related-grid">
          {related.map((item) => {
            const RelatedIcon = featureIcons[item.icon];
            return (
              <Link href={`/features/${item.slug}`} key={item.slug}>
                <RelatedIcon size={20} />
                <div><strong>{item.navTitle}</strong><span>{item.summary}</span></div>
                <ArrowRight size={17} />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="marketing-final">
        <div><p>PRIVATE BETA</p><h2>Uji dengan percakapan bisnis Anda sendiri.</h2></div>
        <Link className="marketing-button light" href="/signup">
          Mulai gratis <ArrowRight size={17} />
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
