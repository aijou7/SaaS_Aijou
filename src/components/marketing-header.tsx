import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { AijouLogo } from "@/components/aijou-logo";
import { MarketingNavigation } from "@/components/marketing-navigation";
import { getMarketingFeatureGroups } from "@/lib/marketing-features";

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <Link className="marketing-brand" href="/" aria-label="Aijou AI — beranda">
        <AijouLogo size={36} />
        <span><strong>Aijou AI</strong><small>Customer workspace</small></span>
      </Link>
      <MarketingNavigation groups={getMarketingFeatureGroups()} />
      <div className="marketing-header-actions">
        <Link href="/login">Masuk</Link>
        <Link className="marketing-button compact" href="/signup">
          Coba gratis <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
