import { Bot, Power, SlidersHorizontal } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { updateAgentSettingsAction } from "@/app/agent/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getAgentSettingsPage } from "@/server/agent/settings";
import { getBusinessProfilePage } from "@/server/business/profile";

type AgentSettingsPageProps = {
  searchParams: Promise<{ error?: string; saved?: string }>;
};

export default async function AgentSettingsPage({ searchParams }: AgentSettingsPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getAgentSettingsPage(session.userId);
  const [profile, params] = await Promise.all([
    getBusinessProfilePage(session.userId),
    searchParams,
  ]);
  const activationLocked = !page.settings.isActive && !profile.readiness.canActivateAgent;

  return (
    <AppShell active="agent" businessName={page.business?.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">Suara Aijou</p>
          <h1>Atur cara Aijou berbicara dan kapan harus meneruskan chat ke tim.</h1>
          <p>
            Pengaturan ini membentuk pengalaman pelanggan. Saat Aijou dimatikan, chat langsung
            masuk ke tim Anda.
          </p>
        </section>

        <section className="grid" aria-label="Agent summary">
          <div className="card">
            <Bot size={22} aria-hidden="true" />
            <h2>Nama agent</h2>
            <div className="metric">{page.settings.agentName}</div>
            <p className="muted">{page.business?.businessName ?? "Business belum ada"}</p>
          </div>
          <div className="card">
            <Power size={22} aria-hidden="true" />
            <h2>Status Aijou</h2>
            <div className="metric">{page.settings.isActive ? "Aktif" : "Nonaktif"}</div>
            <p className="muted">Membantu menjawab pelanggan secara otomatis.</p>
          </div>
          <div className="card">
            <SlidersHorizontal size={22} aria-hidden="true" />
            <h2>Tone</h2>
            <div className="metric">{page.settings.tone.split(",")[0]}</div>
            <p className="muted">Bahasa: {page.settings.language}</p>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <h2>Konfigurasi Aijou</h2>
            {params.saved === "1" ? (
              <div className="settings-note" role="status">
                <strong>Pengaturan Aijou tersimpan</strong>
                <p>
                  {page.settings.isActive
                    ? "Auto-reply aktif untuk channel yang sudah tersambung."
                    : "Aijou masih dalam mode aman dan belum membalas channel live."}
                </p>
              </div>
            ) : null}
            {params.error === "not_ready" ? (
              <div className="settings-note" role="alert">
                <strong>Auto-reply belum diaktifkan</strong>
                <p>Lengkapi seluruh readiness terlebih dahulu, lalu aktifkan kembali dari halaman ini.</p>
              </div>
            ) : null}
            {!page.settings.isActive ? (
              <div className="settings-note" role="status">
                <strong>
                  {profile.readiness.canActivateAgent
                    ? "Semua prasyarat siap"
                    : "Mode aman masih aktif"}
                </strong>
                <p>
                  {profile.readiness.canActivateAgent
                    ? "Centang aktivasi di bawah untuk mulai mengizinkan auto-reply di channel live."
                    : `Masih perlu: ${profile.readiness.missingBeforeActivation
                        .map((check) => check.label)
                        .join(", ")}.`}
                </p>
                {!profile.readiness.canActivateAgent ? (
                  <Link className="ghost-button" href="/setup">Lihat checklist setup</Link>
                ) : null}
              </div>
            ) : null}
            <form className="form-grid" action={updateAgentSettingsAction}>
              <label>
                Agent Name
                <input name="agentName" type="text" defaultValue={page.settings.agentName} maxLength={80} required />
              </label>
              <label>
                Language
                <select name="language" defaultValue={page.settings.language}>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                Tone
                <input name="tone" type="text" defaultValue={page.settings.tone} maxLength={200} />
              </label>
              <label className="checkbox-label">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={page.settings.isActive}
                  disabled={activationLocked}
                />
                Aktifkan auto-reply di channel live
              </label>
              <label className="span-2">
                Business Description
                <textarea
                  name="businessDescription"
                  defaultValue={page.settings.businessDescription ?? ""}
                  maxLength={4000}
                />
              </label>
              <label className="span-2">
                Opening Message
                <textarea name="openingMessage" defaultValue={page.settings.openingMessage ?? ""} maxLength={1000} />
              </label>
              <label className="span-2">
                Closing Message
                <textarea name="closingMessage" defaultValue={page.settings.closingMessage ?? ""} maxLength={1000} />
              </label>
              <label className="span-2">
                Handoff Rules
                <textarea name="handoffRules" defaultValue={page.settings.handoffRules ?? ""} maxLength={4000} />
              </label>
              <label className="span-2">
                System Instruction
                <textarea
                  name="systemInstruction"
                  defaultValue={page.settings.systemInstruction ?? ""}
                  maxLength={8000}
                />
              </label>
              <button className="primary-button span-2" type="submit">
                Save agent settings
              </button>
            </form>
          </div>
        </section>
    </AppShell>
  );
}
