"use client";

import { ArrowRight, Check, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  type BillingCycle,
  getAnnualMonthlyEquivalent,
  getAnnualPrice,
  getAnnualSavings,
  subscriptionPlans,
} from "@/lib/subscription-plans";

const rupiah = new Intl.NumberFormat("id-ID");

function formatPrice(value: number) {
  return `Rp${rupiah.format(value)}`;
}

export function MarketingPricing({
  trialAvailability,
}: {
  trialAvailability: { available: boolean; remaining: number; limit: number };
}) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("annual");
  const annual = billingCycle === "annual";

  return (
    <section className="marketing-pricing" id="pricing" aria-labelledby="marketing-pricing-title">
      <div className="marketing-section-head marketing-pricing-head">
        <div>
          <p className="marketing-eyebrow">Harga yang mudah dihitung</p>
          <h2 id="marketing-pricing-title">Mulai bulanan. Lebih hemat saat tahunan.</h2>
        </div>
        <div className="marketing-pricing-intro">
          <p>
            Bayar 10 bulan untuk akses 12 bulan. Starter dan Growth mendapat trial 30 hari
            untuk {trialAvailability.limit} workspace terverifikasi pertama.
          </p>
          <div className="marketing-billing-toggle" role="group" aria-label="Pilih periode pembayaran">
            <button
              type="button"
              aria-pressed={!annual}
              className={!annual ? "active" : ""}
              onClick={() => setBillingCycle("monthly")}
            >
              Bulanan
            </button>
            <button
              type="button"
              aria-pressed={annual}
              className={annual ? "active" : ""}
              onClick={() => setBillingCycle("annual")}
            >
              Tahunan <span>2 bulan gratis</span>
            </button>
          </div>
        </div>
      </div>

      <div className="marketing-pricing-grid">
        {subscriptionPlans.map((plan) => {
          const displayedPrice = annual ? getAnnualPrice(plan.monthlyPrice) : plan.monthlyPrice;
          const signupHref = `/signup?plan=${plan.id}&billing=${billingCycle}`;

          return (
            <article
              className={`marketing-price-card${plan.recommended ? " recommended" : ""}`}
              key={plan.id}
            >
              <header>
                <div className="marketing-plan-badges">
                  {plan.recommended ? <span className="recommended-badge"><Sparkles size={13} /> Paling populer</span> : null}
                  {plan.trialDays > 0 && trialAvailability.available
                    ? <span className="trial-badge">Gratis 30 hari · {trialAvailability.remaining} slot</span>
                    : <span className="assisted-badge">{plan.trialDays > 0 ? "Trial sudah penuh" : "Onboarding dibantu"}</span>}
                </div>
                <h3>{plan.name}</h3>
                <p>{plan.description}</p>
              </header>

              <div className="marketing-plan-price" aria-live="polite">
                <strong>{formatPrice(displayedPrice)}</strong>
                <span>/{annual ? "tahun" : "bulan"}</span>
              </div>

              <div className="marketing-plan-saving">
                {annual ? (
                  <>
                    <strong>Hemat {formatPrice(getAnnualSavings(plan.monthlyPrice))}</strong>
                    <span>setara {formatPrice(getAnnualMonthlyEquivalent(plan.monthlyPrice))}/bulan</span>
                  </>
                ) : (
                  <>
                    <strong>Bayar sesuai pemakaian bulanan</strong>
                    <span>Bisa beralih ke tahunan kapan saja</span>
                  </>
                )}
              </div>

              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}><Check size={16} aria-hidden="true" /> {feature}</li>
                ))}
              </ul>

              <Link className="marketing-plan-cta" href={signupHref}>
                {plan.trialDays > 0 && trialAvailability.available
                  ? "Mulai trial gratis"
                  : plan.trialDays > 0 ? `Pilih ${plan.name}` : "Pilih Business"}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <small className="marketing-plan-footnote">
                {plan.trialDays > 0 && trialAvailability.available
                  ? "Slot diklaim setelah OTP email berhasil, selama kuota masih tersedia."
                  : plan.trialDays > 0
                    ? "Kuota 100 trial pertama sudah habis; paket aktif setelah pembayaran."
                  : "Paket Business tidak termasuk free trial dan aktif setelah pembayaran terverifikasi."}
              </small>
            </article>
          );
        })}
      </div>

      <p className="marketing-pricing-note">
        Kredit AI diperbarui setiap bulan dan pemakaiannya dapat dipantau dari dashboard.
        Biaya percakapan WhatsApp dari Meta dihitung terpisah. Pembayaran paket diproses melalui Midtrans;
        paket baru aktif setelah status transaksi terverifikasi.
      </p>
    </section>
  );
}
