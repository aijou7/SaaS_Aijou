"use client";

import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MarketingFeatureIcon } from "@/components/marketing-feature-icon";
import type {
  MarketingFeatureCategory,
  MarketingFeatureIcon as MarketingFeatureIconName,
} from "@/lib/marketing-features";

export type MarketingNavigationGroup = {
  category: MarketingFeatureCategory;
  features: Array<{
    slug: string;
    icon: MarketingFeatureIconName;
    navTitle: string;
  }>;
};

export function MarketingNavigation({ groups }: { groups: MarketingNavigationGroup[] }) {
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setFeaturesOpen(false);
      setMobileOpen(false);
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest(".marketing-mobile-menu-button")) return;
      if (!(target instanceof Node) || !navRef.current?.contains(target)) {
        setFeaturesOpen(false);
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function openFeatures() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setFeaturesOpen(true);
  }

  function scheduleClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setFeaturesOpen(false), 140);
  }

  function closeNavigation() {
    setFeaturesOpen(false);
    setMobileOpen(false);
  }

  return (
    <>
      <nav
        ref={navRef}
        className={`marketing-navigation${mobileOpen ? " mobile-open" : ""}`}
        aria-label="Navigasi utama"
      >
        <div
          className="marketing-feature-nav"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") openFeatures();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") scheduleClose();
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              scheduleClose();
            }
          }}
        >
          <button
            className="marketing-nav-trigger"
            type="button"
            aria-expanded={featuresOpen}
            aria-controls="marketing-feature-menu"
            onClick={() => {
              if (window.matchMedia("(max-width: 980px)").matches) {
                setFeaturesOpen((current) => !current);
                return;
              }
              openFeatures();
            }}
          >
            Fitur <ChevronDown size={15} aria-hidden="true" />
          </button>

          <div
            className={`marketing-mega-menu${featuresOpen ? " open" : ""}`}
            id="marketing-feature-menu"
            aria-hidden={!featuresOpen}
          >
            <div className="marketing-mega-grid">
              {groups.map((group, groupIndex) => (
                <section key={group.category} aria-labelledby={`marketing-feature-group-${groupIndex}`}>
                  <p id={`marketing-feature-group-${groupIndex}`}>{group.category}</p>
                  <div>
                    {group.features.map((feature) => (
                      <Link
                        href={`/features/${feature.slug}`}
                        key={feature.slug}
                        tabIndex={featuresOpen ? 0 : -1}
                        onClick={closeNavigation}
                      >
                        <span><MarketingFeatureIcon name={feature.icon} size={18} /></span>
                        <strong>{feature.navTitle}</strong>
                        <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <Link
              className="marketing-mega-footer"
              href="/features"
              tabIndex={featuresOpen ? 0 : -1}
              onClick={closeNavigation}
            >
              <span><strong>Lihat semua fitur</strong><small>Penjelasan lengkap dan cara kerja setiap fitur Aijou</small></span>
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <Link href="/#industries" onClick={closeNavigation}>Industri</Link>
        <Link href="/#workflow" onClick={closeNavigation}>Cara kerja</Link>
      </nav>

      <button
        className="marketing-mobile-menu-button"
        type="button"
        aria-label={mobileOpen ? "Tutup navigasi" : "Buka navigasi"}
        aria-expanded={mobileOpen}
        onClick={() => {
          setMobileOpen((current) => !current);
          setFeaturesOpen(false);
        }}
      >
        {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
    </>
  );
}
