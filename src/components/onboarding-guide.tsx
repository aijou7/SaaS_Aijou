"use client";

import {
  Bot,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  Circle,
  Clock3,
  ExternalLink,
  LockKeyhole,
  MessageCircle,
  Minimize2,
  PlayCircle,
  RadioTower,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type FormEvent,
} from "react";
import {
  completeOnboardingUiAction,
  saveOnboardingAgentUiAction,
  saveOnboardingBusinessUiAction,
  saveOnboardingKnowledgeUiAction,
  type CompleteOnboardingResult,
} from "@/app/setup/actions";
import { ChannelOnboardingChoices } from "@/components/channel-setup-guide";
import { showToast } from "@/components/toast-center";

type GuideKey =
  | "business-profile"
  | "agent-config"
  | "knowledge"
  | "simulator"
  | "groq"
  | "channel"
  | "agent-active";

type GuideCheck = {
  key: GuideKey;
  label: string;
  description: string;
  done: boolean;
  href: string;
  requiredBeforeActivation: boolean;
};

type GuideStatus = {
  onboardingCompleted: boolean;
  readyToComplete: boolean;
  completed: number;
  total: number;
  percent: number;
  checks: GuideCheck[];
  profile?: {
    businessName?: string | null;
    businessType?: string | null;
    whatsappNumber?: string | null;
    serviceArea?: string | null;
    operatingHours?: string | null;
    mainServices?: string | null;
    websiteUrl?: string | null;
    address?: string | null;
  } | null;
  agent?: {
    agentName?: string | null;
    tone?: string | null;
    language?: string | null;
    openingMessage?: string | null;
    businessDescription?: string | null;
    handoffRules?: string | null;
    systemInstruction?: string | null;
  } | null;
};

type GuideCopy = {
  eyebrow: string;
  title: string;
  body: string;
  tip: string;
  action: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
};

const minimizedKey = "aijou:onboarding:minimized";

const guideCopy: Record<GuideKey, GuideCopy> = {
  "business-profile": {
    eyebrow: "Fondasi bisnis",
    title: "Mulai dari konteks bisnis yang benar",
    body: "Isi jenis bisnis, layanan utama, area pelayanan, dan jam operasional. Informasi ini menjadi dasar setiap jawaban AI milik bisnismu.",
    tip: "Tulis informasi yang memang boleh disampaikan kepada customer. Detail internal bisa ditambahkan nanti.",
    action: "Isi profil bisnis",
    icon: Building2,
  },
  "agent-config": {
    eyebrow: "Kepribadian AI",
    title: "Tentukan identitas AI sesuai merek bisnismu",
    body: "Atur nama agent, gaya komunikasi, instruksi utama, dan kondisi ketika percakapan harus diambil alih tim.",
    tip: "Gunakan bahasa yang biasa dipakai tim customer service Anda agar jawaban terasa konsisten.",
    action: "Atur AI agent",
    icon: Bot,
  },
  knowledge: {
    eyebrow: "Sumber jawaban",
    title: "Bekali AI dengan knowledge bisnis",
    body: "Tambahkan informasi awal seperti layanan, FAQ, prosedur, atau harga yang boleh dipublikasikan.",
    tip: "Mulai dari pertanyaan customer yang paling sering muncul. Knowledge dapat ditambah dan diperbarui kapan saja.",
    action: "Tambah knowledge",
    icon: Sparkles,
  },
  simulator: {
    eyebrow: "Uji sebelum live",
    title: "Coba percakapan sebagai customer",
    body: "Gunakan simulator untuk memeriksa ketepatan jawaban, gaya bahasa, konteks lanjutan, dan alur human takeover.",
    tip: "Coba satu pertanyaan mudah, satu pertanyaan teknis, dan satu permintaan untuk berbicara dengan manusia.",
    action: "Buka simulator",
    icon: PlayCircle,
  },
  groq: {
    eyebrow: "Mesin AI",
    title: "Pastikan provider AI tersedia",
    body: "Platform memeriksa koneksi provider AI secara otomatis. Langkah ini biasanya sudah disiapkan untuk seluruh workspace.",
    tip: "Jika status belum siap, buka pemeriksaan readiness atau hubungi pengelola platform. Anda tidak perlu memasukkan API key pribadi.",
    action: "Lihat pemeriksaan",
    icon: RadioTower,
  },
  channel: {
    eyebrow: "Channel pertama",
    title: "Hubungkan satu tempat masuknya percakapan",
    body: "Pilih Web Live Chat, Telegram, atau WhatsApp. Satu channel yang berhasil menerima pesan sudah cukup untuk melanjutkan.",
    tip: "Credential WhatsApp belum tersedia? Minimalkan panduan dan lanjutkan menjelajah. Anda juga bisa menguji Web Live Chat atau Telegram lebih dulu.",
    action: "Pilih channel",
    icon: MessageCircle,
  },
  "agent-active": {
    eyebrow: "Aktivasi akhir",
    title: "Aktifkan auto-reply setelah hasil tes sesuai",
    body: "Periksa kembali instruksi dan hasil simulator, lalu aktifkan AI secara eksplisit. Setelah aktif, pesan baru pada channel terhubung dapat dibalas otomatis dengan identitas bisnismu.",
    tip: "Human takeover tetap tersedia kapan saja setelah workspace aktif.",
    action: "Tinjau dan aktifkan",
    icon: Rocket,
  },
};

export function OnboardingGuide() {
  const pathname = usePathname();
  const [status, setStatus] = useState<GuideStatus | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [selectedKey, setSelectedKey] = useState<GuideKey | null>(null);
  const [checking, setChecking] = useState(false);
  const [completing, startCompleting] = useTransition();
  const [saving, startSaving] = useTransition();
  const dialogRef = useRef<HTMLElement>(null);
  const initialPathRef = useRef(pathname);

  const loadStatus = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch("/api/onboarding/status", {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return;
      const payload: unknown = await response.json();
      if (!isGuideStatus(payload)) return;
      setMinimized(window.sessionStorage.getItem(minimizedKey) === "1");
      setStatus(payload);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadStatus]);

  useEffect(() => {
    if (initialPathRef.current === pathname) return;
    initialPathRef.current = pathname;
    const timeout = window.setTimeout(() => void loadStatus(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadStatus, pathname]);

  const minimize = useCallback(() => {
    window.sessionStorage.setItem(minimizedKey, "1");
    setMinimized(true);
  }, []);

  const expand = () => {
    window.sessionStorage.removeItem(minimizedKey);
    setMinimized(false);
    void loadStatus();
  };

  const firstMissingIndex = useMemo(
    () => status?.checks.findIndex((check) => !check.done) ?? -1,
    [status],
  );
  const requiredCheck =
    status && firstMissingIndex >= 0 ? status.checks[firstMissingIndex] : null;
  const selectedCheck =
    status?.checks.find((check) => check.key === selectedKey) ?? requiredCheck;
  const selectedIndex = selectedCheck
    ? status?.checks.findIndex((check) => check.key === selectedCheck.key) ?? 0
    : status?.checks.length ?? 0;

  useEffect(() => {
    if (minimized || !status || status.onboardingCompleted) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        minimize();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable(dialog);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", handleKeyDown);
    return () => {
      dialog.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [minimize, minimized, status]);

  if (!status || status.onboardingCompleted) return null;

  if (minimized) {
    return (
      <button className="onboarding-guide-dock" type="button" onClick={expand}>
        <span className="onboarding-guide-dock-progress" aria-hidden="true">
          {status.percent}%
        </span>
        <span>
          <strong>Lanjutkan setup</strong>
          <small>{requiredCheck?.label ?? "Selesaikan aktivasi workspace"}</small>
        </span>
        <ExternalLink size={17} aria-hidden="true" />
      </button>
    );
  }

  const finalStep = status.readyToComplete;
  const copy = selectedCheck ? guideCopy[selectedCheck.key] : null;
  const SelectedIcon = copy?.icon ?? Rocket;
  const submitInline = (
    event: FormEvent<HTMLFormElement>,
    action: (formData: FormData) => Promise<CompleteOnboardingResult>,
  ) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startSaving(async () => {
      const result = await action(formData);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setSelectedKey(null);
        await loadStatus();
      }
    });
  };

  return (
    <div
      className="onboarding-guide-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) minimize();
      }}
    >
      <section
        className="onboarding-guide-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-guide-title"
        tabIndex={-1}
      >
        <aside className="onboarding-guide-rail">
          <div className="onboarding-guide-brand">
            <span><Rocket size={18} aria-hidden="true" /></span>
            <div>
              <strong>Siapkan workspace</strong>
              <small>{status.completed}/{status.total} langkah siap</small>
            </div>
          </div>
          <div
            className="onboarding-guide-progress"
            role="progressbar"
            aria-label="Progress setup workspace"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={status.percent}
          >
            <span style={{ width: `${status.percent}%` }} />
          </div>
          <ol>
            {status.checks.map((check, index) => {
              const isSelected = !finalStep && selectedCheck?.key === check.key;
              const accessible = check.done || firstMissingIndex === -1 || index <= firstMissingIndex;
              return (
                <li key={check.key}>
                  <button
                    type="button"
                    className={isSelected ? "active" : undefined}
                    disabled={!accessible}
                    aria-current={isSelected ? "step" : undefined}
                    onClick={() => setSelectedKey(check.key)}
                  >
                    <span className={check.done ? "done" : undefined}>
                      {check.done ? (
                        <Check size={14} aria-hidden="true" />
                      ) : accessible ? (
                        index + 1
                      ) : (
                        <LockKeyhole size={13} aria-hidden="true" />
                      )}
                    </span>
                    <span>
                      <strong>{check.label}</strong>
                      <small>{check.done ? "Selesai" : accessible ? "Langkah berikutnya" : "Menunggu langkah sebelumnya"}</small>
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" className={finalStep ? "active" : undefined} disabled={!finalStep}>
                <span>{status.onboardingCompleted ? <Check size={14} /> : status.total + 1}</span>
                <span><strong>Workspace siap</strong><small>Aktivasi final</small></span>
              </button>
            </li>
          </ol>
        </aside>

        <div className="onboarding-guide-content">
          <header>
            <div>
              <p className="eyebrow">Panduan setup · Langkah {Math.min(selectedIndex + 1, status.total + 1)} dari {status.total + 1}</p>
              <h2 id="onboarding-guide-title">
                {finalStep ? "Semua pemeriksaan sudah siap" : copy?.title}
              </h2>
            </div>
            <button className="onboarding-guide-minimize" type="button" onClick={minimize}>
              <Minimize2 size={17} aria-hidden="true" />
              Minimalkan
            </button>
          </header>

          <div className="onboarding-guide-step-card">
            <span className="onboarding-guide-step-icon">
              {finalStep ? <CheckCircle2 size={27} aria-hidden="true" /> : <SelectedIcon size={27} aria-hidden={true} />}
            </span>
            <p className="eyebrow">{finalStep ? "Ready to use" : copy?.eyebrow}</p>
            <h3>{finalStep ? "Selesaikan onboarding dan mulai gunakan workspace" : selectedCheck?.label}</h3>
            <p>
              {finalStep
                ? "Profil, knowledge, pengujian, channel, dan auto-reply sudah lolos pemeriksaan. Konfirmasi sekali lagi untuk mengakhiri panduan wajib."
                : copy?.body}
            </p>
          </div>

          {!finalStep && copy ? (
            <div className="onboarding-guide-tip">
              <Clock3 size={18} aria-hidden="true" />
              <div><strong>Yang perlu diketahui</strong><p>{copy.tip}</p></div>
            </div>
          ) : null}

          {!finalStep && selectedCheck?.key === "business-profile" ? (
            <form
              className="form-grid onboarding-guide-inline-form"
              onSubmit={(event) => submitInline(event, saveOnboardingBusinessUiAction)}
            >
              <label>Nama bisnis<input name="businessName" defaultValue={status.profile?.businessName ?? ""} required /></label>
              <label>Jenis bisnis<input name="businessType" defaultValue={status.profile?.businessType ?? ""} placeholder="Konsultan IT, retail, klinik…" required /></label>
              <label className="span-2">Layanan utama<textarea name="mainServices" defaultValue={status.profile?.mainServices ?? ""} placeholder="Layanan yang boleh ditawarkan AI kepada pelanggan" required /></label>
              <label>Area layanan<input name="serviceArea" defaultValue={status.profile?.serviceArea ?? ""} placeholder="Lombok dan remote seluruh Indonesia" required /></label>
              <label>Jam operasional<input name="operatingHours" defaultValue={status.profile?.operatingHours ?? ""} placeholder="Senin–Sabtu, 09.00–18.00 WITA" required /></label>
              <label>WhatsApp bisnis<input name="whatsappNumber" defaultValue={status.profile?.whatsappNumber ?? ""} placeholder="628…" /></label>
              <label>Website<input name="websiteUrl" type="url" defaultValue={status.profile?.websiteUrl ?? ""} placeholder="https://bisnis.com" /></label>
              <label className="span-2">Alamat publik<input name="address" defaultValue={status.profile?.address ?? ""} /></label>
              <button className="primary-button span-2" type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan dan lanjut"}</button>
            </form>
          ) : null}

          {!finalStep && selectedCheck?.key === "agent-config" ? (
            <form
              className="form-grid onboarding-guide-inline-form"
              onSubmit={(event) => submitInline(event, saveOnboardingAgentUiAction)}
            >
              <label>Nama agent<input name="agentName" defaultValue={status.agent?.agentName ?? "AI Assistant"} required /></label>
              <label>Gaya bahasa<input name="tone" defaultValue={status.agent?.tone ?? "ramah, natural, ringkas, dan teknis saat diperlukan"} required /></label>
              <label>Bahasa<select name="language" defaultValue={status.agent?.language ?? "id"}><option value="id">Bahasa Indonesia</option><option value="en">English</option></select></label>
              <label>Pesan pembuka<input name="openingMessage" defaultValue={status.agent?.openingMessage ?? "Halo, ada yang bisa saya bantu?"} /></label>
              <label className="span-2">Deskripsi tambahan bisnis<textarea name="businessDescription" defaultValue={status.agent?.businessDescription ?? ""} placeholder="Konteks tambahan yang belum ada di profil bisnis" /></label>
              <label className="span-2">Kapan serahkan ke manusia<textarea name="handoffRules" defaultValue={status.agent?.handoffRules ?? "Serahkan ke tim jika customer meminta manusia, komplain, meminta harga final, atau keputusan membutuhkan otorisasi owner."} required /></label>
              <label className="span-2">Instruksi utama<textarea name="systemInstruction" defaultValue={status.agent?.systemInstruction ?? "Jawab langsung, natural, padat, dan berdasarkan fakta bisnis yang sudah disetujui. Jangan mengarang harga, layanan, atau janji."} required /></label>
              <button className="primary-button span-2" type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan dan lanjut"}</button>
            </form>
          ) : null}

          {!finalStep && selectedCheck?.key === "knowledge" ? (
            <form
              className="form-grid onboarding-guide-inline-form"
              onSubmit={(event) => submitInline(event, saveOnboardingKnowledgeUiAction)}
            >
              <label>Judul<input name="title" defaultValue="Informasi bisnis utama" required /></label>
              <label>Kategori<input name="category" defaultValue="onboarding" required /></label>
              <label className="span-2">Informasi yang boleh disampaikan AI<textarea name="content" placeholder="Contoh: Kami melayani instalasi jaringan, pembuatan website, dan AI agent. Harga final ditentukan setelah scope dikonfirmasi." required /></label>
              <p className="muted span-2">Informasi ini ditulis langsung oleh owner, sehingga aktif setelah disimpan. Import file dan percakapan tetap melalui tahap review.</p>
              <button className="primary-button span-2" type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan dan lanjut"}</button>
            </form>
          ) : null}

          {!finalStep && selectedCheck?.key === "channel" ? (
            <ChannelOnboardingChoices onNavigate={minimize} />
          ) : null}

          <footer>
            <div>
              {!finalStep && selectedIndex > 0 ? (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setSelectedKey(status.checks[selectedIndex - 1]?.key ?? null)}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  Sebelumnya
                </button>
              ) : <span />}
              <button className="ghost-button" type="button" onClick={() => void loadStatus()} disabled={checking}>
                <RefreshCw className={checking ? "is-spinning" : undefined} size={16} aria-hidden="true" />
                {checking ? "Memeriksa…" : "Cek ulang progress"}
              </button>
            </div>
            {finalStep ? (
              <button
                className="primary-button"
                type="button"
                disabled={completing}
                onClick={() => {
                  startCompleting(async () => {
                    const result = await completeOnboardingUiAction();
                    showToast(result.message, result.ok ? "success" : "error");
                    if (result.ok) await loadStatus();
                  });
                }}
              >
                <Rocket size={17} aria-hidden="true" />
                {completing ? "Mengaktifkan…" : "Selesaikan dan gunakan workspace"}
              </button>
            ) : selectedCheck?.key !== "channel" &&
              selectedCheck?.key !== "business-profile" &&
              selectedCheck?.key !== "agent-config" &&
              selectedCheck?.key !== "knowledge" && copy ? (
              <Link className="primary-button" href={selectedCheck!.href as Route} onClick={minimize}>
                {copy.action}
                <ExternalLink size={16} aria-hidden="true" />
              </Link>
            ) : null}
          </footer>
        </div>
      </section>
    </div>
  );
}

function isGuideStatus(value: unknown): value is GuideStatus {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.onboardingCompleted === "boolean" &&
    typeof record.readyToComplete === "boolean" &&
    typeof record.completed === "number" &&
    typeof record.total === "number" &&
    typeof record.percent === "number" &&
    Array.isArray(record.checks) &&
    record.checks.every((check) => {
      if (!check || typeof check !== "object") return false;
      const item = check as Record<string, unknown>;
      return (
        typeof item.key === "string" &&
        item.key in guideCopy &&
        typeof item.label === "string" &&
        typeof item.description === "string" &&
        typeof item.done === "boolean" &&
        typeof item.href === "string"
      );
    })
  );
}

function getFocusable(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("hidden"));
}
