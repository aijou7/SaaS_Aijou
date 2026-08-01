import { Clock3, Moon, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { updateBusinessHoursAction } from "@/app/hours/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { evaluateBusinessHours, getBusinessHoursPage } from "@/server/operations/business-hours";

const dayLabels = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export default async function HoursPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const page = await getBusinessHoursPage(session.userId);
  const current = evaluateBusinessHours({
    enabled: page.settings.businessHoursEnabled,
    schedule: page.settings.businessHours,
    timeZone: page.settings.timeZone,
  });
  return (
    <AppShell active="hours" businessName={page.businessName}>
      <section className="ops-page">
        <header className="ops-header">
          <div><p className="eyebrow">Otomasi layanan</p><h1>Jam kerja AI</h1><p>Tentukan kapan Aijou menjawab dan apa yang terjadi setelah operasional tutup.</p></div>
          <span className={current.isOpen ? "ops-live-badge" : "ops-live-badge muted-badge"}><Clock3 size={16} />{current.isOpen ? "Sedang aktif" : "Di luar jam kerja"}</span>
        </header>
        <form className="ops-settings-grid" action={updateBusinessHoursAction}>
          <section className="ops-card ops-span-2">
            <div className="ops-card-title"><div className="icon-tile"><Clock3 size={20} /></div><div><h2>Jadwal mingguan</h2><p>Zona waktu utama: Lombok / WITA.</p></div></div>
            <label className="toggle-row"><input name="businessHoursEnabled" type="checkbox" defaultChecked={page.settings.businessHoursEnabled} /><span><strong>Gunakan jam kerja untuk AI</strong><small>Jika mati, AI tetap melayani 24/7.</small></span></label>
            <label className="field-label">Zona waktu<select name="timeZone" defaultValue={page.settings.timeZone}><option value="Asia/Makassar">Lombok / WITA (Asia/Makassar)</option><option value="Asia/Jakarta">WIB (Asia/Jakarta)</option><option value="Asia/Jayapura">WIT (Asia/Jayapura)</option></select></label>
            <div className="hours-list">
              {page.settings.businessHours.map((day) => <div className="hours-row" key={day.day}><label className="hours-day"><input name={`hours_${day.day}_enabled`} type="checkbox" defaultChecked={day.enabled} />{dayLabels[day.day]}</label><label><span>Buka</span><input name={`hours_${day.day}_start`} type="time" defaultValue={day.start} /></label><label><span>Tutup</span><input name={`hours_${day.day}_end`} type="time" defaultValue={day.end} /></label></div>)}
            </div>
          </section>
          <section className="ops-card">
            <div className="ops-card-title"><div className="icon-tile"><Moon size={20} /></div><div><h2>Di luar jam kerja</h2><p>Pilih pengalaman pelanggan saat tim offline.</p></div></div>
            <label className="field-label">Mode<select name="afterHoursMode" defaultValue={page.settings.afterHoursMode}><option value="HANDOFF">Balas singkat lalu antrekan ke tim</option><option value="AUTO_REPLY">Kirim pesan di luar jam kerja</option><option value="PAUSE_AI">Simpan chat tanpa balasan AI</option></select></label>
            <label className="field-label">Pesan otomatis<textarea name="afterHoursMessage" rows={5} defaultValue={page.settings.afterHoursMessage} /></label>
          </section>
          <section className="ops-card ops-callout"><ShieldCheck size={22} /><div><h2>Aman secara default</h2><p>Perubahan tidak memotong percakapan aktif. Chat baru di luar jadwal masuk ke antrean manusia dan tetap tersimpan.</p></div></section>
          <button className="primary-button ops-save" type="submit">Simpan jam kerja</button>
        </form>
      </section>
    </AppShell>
  );
}
