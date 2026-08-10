import {
  Activity,
  BadgeCheck,
  Bot,
  BriefcaseBusiness,
  Building2,
  CircleHelp,
  Code2,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Megaphone,
  Package,
  ReceiptText,
  Send,
  Settings,
  ShoppingBag,
  Tags,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
  Workflow,
  Clock3,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { AijouLogo } from "@/components/aijou-logo";
import { IntentPrefetchLink } from "@/components/intent-prefetch-link";
import { NotificationBell } from "@/components/notification-bell";
import { OnboardingGuide } from "@/components/onboarding-guide";
import { ToastCenter } from "@/components/toast-center";
import {
  WorkspaceUserChip,
  WorkspaceUserSummary,
} from "@/components/workspace-user";
import { isTeamManagementEnabled } from "@/lib/team-feature";

type ModuleKey = "settings" | "inbox" | "ai" | "sales" | "automation";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  key: string;
};

const primaryNavigation = [
  { href: "/conversations", label: "Percakapan", icon: MessageCircle, module: "inbox" as ModuleKey },
  { href: "/agent", label: "AI & Knowledge", icon: Bot, module: "ai" as ModuleKey },
  { href: "/leads", label: "Customer & Penjualan", icon: BriefcaseBusiness, module: "sales" as ModuleKey },
  { href: "/integrations", label: "Otomatisasi", icon: Workflow, module: "automation" as ModuleKey },
  { href: "/dashboard", label: "Pengaturan", icon: Settings, module: "settings" as ModuleKey },
];

const moduleNavigation: Record<ModuleKey, { title: string; items: NavigationItem[] }> = {
  inbox: {
    title: "Kotak masuk",
    items: [
      { href: "/conversations", label: "Semua percakapan", icon: MessageCircle, key: "conversations" },
      { href: "/conversations?status=HUMAN_NEEDED", label: "Butuh bantuan tim", icon: Send, key: "human-takeover" },
      { href: "/quick-replies", label: "Balasan cepat", icon: Zap, key: "quick-replies" },
    ],
  },
  ai: {
    title: "AI & knowledge",
    items: [
      { href: "/agent", label: "Kepribadian AI", icon: Bot, key: "agent" },
      { href: "/knowledge", label: "Knowledge", icon: Tags, key: "knowledge" },
      { href: "/simulator", label: "Uji percakapan", icon: MessageCircle, key: "simulator" },
      { href: "/ai-activity", label: "Aktivitas AI", icon: Activity, key: "ai-activity" },
    ],
  },
  sales: {
    title: "Customer & penjualan",
    items: [
      { href: "/leads", label: "Leads", icon: BriefcaseBusiness, key: "leads" },
      { href: "/customers", label: "Pelanggan & segmen", icon: Users, key: "customers" },
      { href: "/products", label: "Katalog produk", icon: Package, key: "products" },
      { href: "/transactions", label: "Pesanan & penjualan", icon: ShoppingBag, key: "transactions" },
      { href: "/proposals", label: "Draft proposal", icon: FileText, key: "proposals" },
      { href: "/payments", label: "Pembayaran", icon: WalletCards, key: "payments" },
      { href: "/receipts", label: "Review bukti bayar", icon: ReceiptText, key: "receipts" },
      { href: "/reports", label: "Laporan", icon: TrendingUp, key: "reports" },
    ],
  },
  automation: {
    title: "Otomatisasi",
    items: [
      { href: "/integrations", label: "Channel & integrasi", icon: Building2, key: "integrations" },
      { href: "/hours", label: "Jam kerja AI", icon: Clock3, key: "hours" },
      { href: "/complaints", label: "Manajemen komplain", icon: LifeBuoy, key: "complaints" },
      { href: "/broadcasts", label: "Broadcast WhatsApp", icon: Megaphone, key: "broadcasts" },
      { href: "/orders", label: "Otomatisasi pesanan", icon: ShoppingBag, key: "orders" },
      { href: "/shipping", label: "Cek ongkir", icon: Truck, key: "shipping" },
      { href: "/workflows", label: "Workflow builder", icon: Workflow, key: "workflows" },
      { href: "/whatsapp", label: "Setup WhatsApp", icon: Code2, key: "whatsapp" },
      { href: "/readiness", label: "Pemeriksaan siap live", icon: BadgeCheck, key: "readiness" },
    ],
  },
  settings: {
    title: "Ruang kerja",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
      { href: "/business", label: "Profil bisnis", icon: Building2, key: "business" },
      { href: "/setup", label: "Panduan setup", icon: BadgeCheck, key: "setup" },
      { href: "/usage", label: "Penggunaan", icon: Activity, key: "usage" },
      ...(isTeamManagementEnabled()
        ? [{ href: "/team", label: "Tim & akses", icon: Users, key: "team" }]
        : []),
      { href: "/account", label: "Keamanan akun", icon: Settings, key: "account" },
    ],
  },
};

const moduleByActive: Record<string, ModuleKey> = {
  conversations: "inbox",
  "human-takeover": "inbox",
  "quick-replies": "inbox",
  notifications: "inbox",
  agent: "ai",
  knowledge: "ai",
  training: "ai",
  simulator: "ai",
  "ai-activity": "ai",
  leads: "sales",
  customers: "sales",
  products: "sales",
  transactions: "sales",
  proposals: "sales",
  payments: "sales",
  receipts: "sales",
  reports: "sales",
  integrations: "automation",
  telegram: "automation",
  hours: "automation",
  complaints: "automation",
  broadcasts: "automation",
  orders: "automation",
  shipping: "automation",
  workflows: "automation",
  whatsapp: "automation",
  readiness: "automation",
  dashboard: "settings",
  business: "settings",
  setup: "settings",
  usage: "settings",
  team: "settings",
  account: "settings",
};

type AppShellProps = {
  active: string;
  businessName?: string | null;
  children: React.ReactNode;
};

export function AppShell({ active, businessName, children }: AppShellProps) {
  const activeModule = moduleByActive[active] ?? "settings";
  const activeNavigation = moduleNavigation[activeModule];
  const activePrimaryNavigation =
    primaryNavigation.find((item) => item.module === activeModule) ?? primaryNavigation[4];
  const activePage =
    activeNavigation.items.find((item) => item.key === active) ??
    Object.values(moduleNavigation)
      .flatMap((module) => module.items)
      .find((item) => item.key === active) ??
    activeNavigation.items[0];
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);

  return (
    <main className="app-frame">
      <ToastCenter />
      <OnboardingGuide />
      <header className="app-topbar">
        <div className="app-logo-menu">
          <Link className="app-logo" href="/dashboard" aria-label="Aijou AI dashboard">
            <AijouLogo size={30} />
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

        <div className="topbar-context" aria-label="Halaman aktif">
          <span>{activePrimaryNavigation.label}</span>
          <strong>{activePage.label}</strong>
        </div>

        <div className="topbar-actions">
          <Link className="top-icon-button" href="/setup" aria-label="Bantuan" data-tooltip="Bantuan">
            <CircleHelp size={18} aria-hidden="true" />
          </Link>
          <NotificationBell />
          <WorkspaceUserChip />
        </div>
      </header>

      <div className="app-workspace">
        <aside className="settings-sidebar">
          <div className="settings-account">
            <div className="account-avatar">
              <AijouLogo size={34} />
            </div>
            <div>
              <strong>{businessName ?? "Aijou AI"}</strong>
              <span>{groqConfigured ? "AI agent terhubung" : "Workspace belum siap"}</span>
            </div>
          </div>

          <nav className="primary-sidebar-nav" aria-label="Navigasi utama">
            {primaryNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = item.module === activeModule;
              return (
                <IntentPrefetchLink
                  className={isActive ? "primary-sidebar-item active" : "primary-sidebar-item"}
                  href={item.href}
                  key={item.module}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{item.label}</span>
                </IntentPrefetchLink>
              );
            })}
          </nav>

          <p className="sidebar-context-heading">{activeNavigation.title}</p>
          <nav className="settings-nav" aria-label={`Menu ${activeNavigation.title}`}>
            {activeNavigation.items.map((item) => {
              const Icon = item.icon;
              return (
                <IntentPrefetchLink
                  className={active === item.key ? "settings-nav-item active" : "settings-nav-item"}
                  href={item.href}
                  key={item.key}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </IntentPrefetchLink>
              );
            })}
          </nav>

          <div className="settings-footer">
            <WorkspaceUserSummary />
            <form action="/api/auth/logout" method="post">
              <button className="sidebar-logout" type="submit">
                <LogOut size={16} aria-hidden="true" />
                Keluar
              </button>
            </form>
          </div>
        </aside>

        <section className="app-main">
          <div className="app-main-inner">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
