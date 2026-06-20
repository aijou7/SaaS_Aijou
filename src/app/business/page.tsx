import { Building2, Clock3, MapPin, MessageCircle, Wrench } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { updateBusinessProfileAction } from "@/app/business/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getBusinessProfilePage } from "@/server/business/profile";

export default async function BusinessProfilePage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getBusinessProfilePage(session.userId);

  return (
    <AppShell active="business" businessName={page.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Business profile</p>
        <h1>Profil bisnis yang jadi konteks utama AI.</h1>
        <p>
          Informasi ini dipakai untuk onboarding, readiness, dan nanti bisa jadi bahan prompt
          agent supaya jawaban AI lebih sesuai bisnis lo.
        </p>
      </section>

      <section className="grid" aria-label="Business profile summary">
        <div className="card">
          <Building2 size={22} aria-hidden="true" />
          <h2>Business</h2>
          <div className="metric">{page.business?.businessName ?? "-"}</div>
          <p className="muted">{page.business?.businessType ?? "Jenis bisnis belum diisi."}</p>
        </div>
        <div className="card">
          <MapPin size={22} aria-hidden="true" />
          <h2>Area</h2>
          <div className="metric">{page.business?.serviceArea ?? "-"}</div>
          <p className="muted">Area layanan yang boleh disebut AI.</p>
        </div>
        <div className="card">
          <Clock3 size={22} aria-hidden="true" />
          <h2>Readiness</h2>
          <div className="metric">{page.readiness.percent}%</div>
          <p className="muted">
            {page.readiness.completed}/{page.readiness.total} checklist siap.
          </p>
        </div>
      </section>

      <section className="section split-layout">
        <div className="card">
          <h2>Edit Business Profile</h2>
          <form className="form-grid" action={updateBusinessProfileAction}>
            <label>
              Nama Bisnis
              <input
                name="businessName"
                type="text"
                defaultValue={page.business?.businessName ?? ""}
                placeholder="Aijou IT Consultant"
                required
              />
            </label>
            <label>
              Jenis Bisnis
              <input
                name="businessType"
                type="text"
                defaultValue={page.business?.businessType ?? ""}
                placeholder="IT consultant / klinik / toko online"
              />
            </label>
            <label>
              Nomor WhatsApp
              <input
                name="whatsappNumber"
                type="text"
                defaultValue={page.business?.whatsappNumber ?? ""}
                placeholder="62812xxxx"
              />
            </label>
            <label>
              Website / Social
              <input
                name="websiteUrl"
                type="text"
                defaultValue={page.business?.websiteUrl ?? ""}
                placeholder="https://..."
              />
            </label>
            <label>
              Area Layanan
              <input
                name="serviceArea"
                type="text"
                defaultValue={page.business?.serviceArea ?? ""}
                placeholder="Jakarta, Depok, Tangerang"
              />
            </label>
            <label>
              Jam Operasional
              <input
                name="operatingHours"
                type="text"
                defaultValue={page.business?.operatingHours ?? ""}
                placeholder="Senin-Sabtu 09.00-18.00"
              />
            </label>
            <label className="span-2">
              Alamat / Base
              <input
                name="address"
                type="text"
                defaultValue={page.business?.address ?? ""}
                placeholder="Base kantor atau kota utama"
              />
            </label>
            <label className="span-2">
              Layanan Utama
              <textarea
                name="mainServices"
                defaultValue={page.business?.mainServices ?? ""}
                placeholder="Instalasi jaringan LAN/WiFi, setup router, troubleshooting, IT support..."
              />
            </label>
            <button className="primary-button span-2" type="submit">
              Save business profile
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Dipakai buat apa?</h2>
          <div className="checklist">
            <div className="checklist-item">
              <Wrench size={18} aria-hidden="true" />
              <span>
                <strong>AI context</strong>
                <small>Bisnis, layanan, area, dan jam buka jadi konteks dasar agent.</small>
              </span>
            </div>
            <div className="checklist-item">
              <MessageCircle size={18} aria-hidden="true" />
              <span>
                <strong>Customer reply</strong>
                <small>AI bisa jawab lebih natural karena tahu bisnis lo bergerak di apa.</small>
              </span>
            </div>
            <div className="checklist-item">
              <Clock3 size={18} aria-hidden="true" />
              <span>
                <strong>Go live checklist</strong>
                <small>Halaman readiness akan ngecek apakah profil sudah cukup lengkap.</small>
              </span>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
