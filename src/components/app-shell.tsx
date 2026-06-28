import {
  Activity,
  BadgeCheck,
  Bell,
  Bot,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Code2,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Package,
  ReceiptText,
  Search,
  Send,
  Settings,
  Tags,
  TrendingUp,
  UserCircle,
  WalletCards,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { AijouLogo } from "@/components/aijou-logo";

type ModuleKey =
  | "settings"
  | "inbox"
  | "agent"
  | "training"
  | "products"
  | "payments"
  | "reports"
  | "integrations";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  key: string;
};

const topNavigation = [
  { href: "/conversations", label: "Percakapan", icon: MessageCircle, module: "inbox" as ModuleKey },
  { href: "/agent", label: "Aijou AI", icon: Bot, module: "agent" as ModuleKey },
  { href: "/training", label: "Pelatihan", icon: Tags, module: "training" as ModuleKey },
  { href: "/products", label: "Produk", icon: Package, module: "products" as ModuleKey },
  { href: "/payments", label: "Pembayaran", icon: WalletCards, module: "payments" as ModuleKey },
  { href: "/reports", label: "Laporan", icon: TrendingUp, module: "reports" as ModuleKey },
  { href: "/integrations", label: "Integrasi", icon: Building2, module: "integrations" as ModuleKey },
];

const moduleNavigation: Record<ModuleKey, { title: string; items: NavigationItem[] }> = {
  settings: {
    title: "Ruang kerja",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
      { href: "/setup", label: "Panduan setup", icon: BadgeCheck, key: "setup" },
      { href: "/usage", label: "Penggunaan", icon: Activity, key: "usage" },
    ],
  },
  inbox: {
    title: "Percakapan",
    items: [
      { href: "/conversations", label: "Chat langsung", icon: MessageCircle, key: "conversations" },
      { href: "/conversations?status=HUMAN_NEEDED", label: "Butuh bantuan tim", icon: Send, key: "human-takeover" },
      { href: "/leads", label: "Leads", icon: BriefcaseBusiness, key: "leads" },
      { href: "/simulator", label: "Simulator", icon: Zap, key: "simulator" },
    ],
  },
  agent: {
    title: "Aijou AI",
    items: [
      { href: "/agent", label: "Kepribadian", icon: Bot, key: "agent" },
      { href: "/ai-activity", label: "Aktivitas Aijou", icon: Activity, key: "ai-activity" },
    ],
  },
  training: {
    title: "Pelatihan",
    items: [
      { href: "/training", label: "Knowledge", icon: Tags, key: "training" },
      { href: "/knowledge", label: "Knowledge lanjutan", icon: ReceiptText, key: "knowledge" },
      { href: "/simulator", label: "Contoh percakapan", icon: MessageCircle, key: "training-import" },
    ],
  },
  products: {
    title: "Produk",
    items: [
      { href: "/products", label: "Katalog", icon: Package, key: "products" },
      { href: "/transactions?view=create", label: "Buat pesanan", icon: CheckCircle2, key: "order-create" },
    ],
  },
  payments: {
    title: "Pembayaran",
    items: [
      { href: "/payments", label: "Setup pembayaran", icon: WalletCards, key: "payments" },
      { href: "/transactions", label: "Pesanan & penjualan", icon: Package, key: "transactions" },
      { href: "/transactions?view=payment-settings", label: "Pengaturan Xendit", icon: ReceiptText, key: "xendit-settings" },
    ],
  },
  reports: {
    title: "Laporan",
    items: [
      { href: "/reports", label: "Ringkasan", icon: TrendingUp, key: "reports" },
      { href: "/transactions", label: "Laporan penjualan", icon: WalletCards, key: "report-sales" },
      { href: "/ai-activity", label: "Performa Aijou", icon: Activity, key: "report-ai" },
    ],
  },
  integrations: {
    title: "Integrasi",
    items: [
      { href: "/integrations", label: "Platform", icon: Building2, key: "integrations" },
      { href: "/whatsapp", label: "WhatsApp", icon: Code2, key: "whatsapp" },
      { href: "/readiness", label: "Pemeriksaan siap live", icon: BadgeCheck, key: "readiness" },
    ],
  },
};

const moduleByActive: Record<string, ModuleKey> = {
  dashboard: "settings",
  setup: "settings",
  usage: "settings",
  conversations: "inbox",
  leads: "inbox",
  simulator: "inbox",
  agent: "agent",
  "ai-activity": "agent",
  training: "training",
  knowledge: "training",
  products: "products",
  transactions: "payments",
  payments: "payments",
  reports: "reports",
  integrations: "integrations",
  whatsapp: "integrations",
  readiness: "integrations",
};

type AppShellProps = {
  active: string;
  businessName?: string | null;
  children: React.ReactNode;
};

export function AppShell({ active, businessName, children }: AppShellProps) {
  const activeModule = moduleByActive[active] ?? "settings";
  const activeNavigation = moduleNavigation[activeModule];
  const activeSettingsItem =
    activeNavigation.items.find((item) => item.key === active) ??
    Object.values(moduleNavigation)
      .flatMap((module) => module.items)
      .find((item) => item.key === active) ??
    activeNavigation.items[0];
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);

  return (
    <main className="app-frame">
      <header className="app-topbar">
        <div className="app-logo-menu">
          <Link className="app-logo" href="/dashboard" aria-label="Aijou AI dashboard">
            <AijouLogo size={28} />
            <span className="app-wordmark">
              <strong>Aijou AI</strong>
              <small>Sales workspace</small>
            </span>
          </Link>
          <div className="logo-popover" role="tooltip">
            <strong>Aijou AI</strong>
            <span>AI sales workspace untuk percakapan yang bergerak maju.</span>
            <Link href="/dashboard">Buka dashboard</Link>
          </div>
        </div>

        <nav className="top-nav" aria-label="Primary navigation">
          {topNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.module === activeModule;

            return (
              <Link className={isActive ? "top-nav-item active" : "top-nav-item"} href={item.href} key={item.label}>
                <Icon size={16} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <Link className="top-icon-button" href="/readiness" aria-label="Readiness" data-tooltip="Readiness">
            <CalendarDays size={17} aria-hidden="true" />
          </Link>
          <Link className="top-icon-button" href="/transactions" aria-label="Transactions" data-tooltip="Orders">
            <BriefcaseBusiness size={17} aria-hidden="true" />
          </Link>
          <Link className="top-icon-button" href="/setup" aria-label="Help" data-tooltip="Help">
            <CircleHelp size={17} aria-hidden="true" />
          </Link>
          <Link className="top-icon-button" href="/ai-activity" aria-label="Notifications" data-tooltip="AI activity">
            <Bell size={17} aria-hidden="true" />
          </Link>
          <div className="user-chip">
            <span className="avatar-dot">
              <UserCircle size={20} aria-hidden="true" />
            </span>
            <strong>Owner</strong>
            <ChevronDown size={15} aria-hidden="true" />
          </div>
        </div>
      </header>

      <div className="app-workspace">
          <aside className="settings-sidebar">
            <div className="settings-panel-header">
              <strong>{activeNavigation.title}</strong>
              <X size={16} aria-hidden="true" />
            </div>

            <div className="settings-account">
              <div className="account-avatar">
                <AijouLogo size={32} />
              </div>
              <div>
                <strong>{businessName ?? "Aijou AI"}</strong>
                <span>{groqConfigured ? "Aijou AI terhubung" : "Workspace Aijou"}</span>
              </div>
            </div>

            <label className="settings-search">
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Cari menu" />
            </label>

            <nav className="settings-nav" aria-label="Settings navigation">
              {activeNavigation.items.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    className={active === item.key ? "settings-nav-item active" : "settings-nav-item"}
                    href={item.href}
                    key={item.key}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="settings-footer">
              <div className="footer-user">
                <span className="avatar-dot">
                  <UserCircle size={22} aria-hidden="true" />
                </span>
                <div>
                  <strong>owner</strong>
                  <small>Workspace owner</small>
                </div>
                <span className="online-badge">Online</span>
              </div>
              <form action="/api/auth/logout" method="post">
                <button className="sidebar-logout" type="submit">
                  <LogOut size={15} aria-hidden="true" />
                  Keluar
                </button>
              </form>
            </div>
          </aside>

        <section className="app-main">
          <div className="app-main-inner">
            <div className="workspace-bar">
              <div>
                <p className="workspace-kicker">Aijou workspace</p>
                <strong>{activeSettingsItem?.label ?? "Dashboard"}</strong>
              </div>
              <div className="workspace-meta" aria-label="Workspace status">
                <span className="meta-pill">
                  <BadgeCheck size={14} aria-hidden="true" />
                  Workspace siap
                </span>
                <span className={groqConfigured ? "meta-pill" : "meta-pill meta-pill-warning"}>
                  <Zap size={14} aria-hidden="true" />
                  {groqConfigured ? "AI aktif" : "Siapkan AI"}
                </span>
              </div>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
