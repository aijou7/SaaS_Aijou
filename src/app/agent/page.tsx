import { Bot, Power, SlidersHorizontal } from "lucide-react";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { updateAgentSettingsAction } from "@/app/agent/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getAgentSettingsPage } from "@/server/agent/settings";

export default async function AgentSettingsPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const page = await getAgentSettingsPage(session.userId);

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
            <form className="form-grid" action={updateAgentSettingsAction}>
              <label>
                Agent Name
                <input name="agentName" type="text" defaultValue={page.settings.agentName} required />
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
                <input name="tone" type="text" defaultValue={page.settings.tone} />
              </label>
              <label className="checkbox-label">
                <input name="isActive" type="checkbox" defaultChecked={page.settings.isActive} />
                Auto-reply active
              </label>
              <label className="span-2">
                Business Description
                <textarea
                  name="businessDescription"
                  defaultValue={page.settings.businessDescription ?? ""}
                />
              </label>
              <label className="span-2">
                Opening Message
                <textarea name="openingMessage" defaultValue={page.settings.openingMessage ?? ""} />
              </label>
              <label className="span-2">
                Closing Message
                <textarea name="closingMessage" defaultValue={page.settings.closingMessage ?? ""} />
              </label>
              <label className="span-2">
                Handoff Rules
                <textarea name="handoffRules" defaultValue={page.settings.handoffRules ?? ""} />
              </label>
              <label className="span-2">
                System Instruction
                <textarea
                  name="systemInstruction"
                  defaultValue={page.settings.systemInstruction ?? ""}
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
