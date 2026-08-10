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
import { redirect } from "next/navigation";
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
import { getSession } from "@/lib/session";
import type { WorkspaceRoleValue } from "@/lib/team-invites";
import {
  canWorkspace,
  getWorkspaceHome,
  getWorkspaceRoleLabel,
  type WorkspaceCapability,
} from "@/lib/workspace-permissions";

type ModuleKey = "settings" | "inbox" | "ai" | "sales" | "automation";

type NavigationItem = {
  capability: WorkspaceCapability;
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
      { href: "/conversations", label: "Semua percakapan", icon: MessageCircle, key: "conversations", capability: "inbox:view" },
      { href: "/conversations?status=HUMAN_NEEDED", label: "Butuh bantuan tim", icon: Send, key: "human-takeover", capability: "inbox:operate" },
      { href: "/quick-replies", label: "Balasan cepat", icon: Zap, key: "quick-replies", capability: "inbox:operate" },
    ],
  },
  ai: {
    title: "AI & knowledge",
    items: [
      { href: "/agent", label: "Kepribadian AI", icon: Bot, key: "agent", capability: "ai:manage" },
      { href: "/knowledge", label: "Knowledge", icon: Tags, key: "knowledge", capability: "ai:manage" },
      { href: "/simulator", label: "Uji percakapan", icon: MessageCircle, key: "simulator", capability: "ai:manage" },
      { href: "/ai-activity", label: "Aktivitas AI", icon: Activity, key: "ai-activity", capability: "ai:view" },
    ],
  },
  sales: {
    title: "Customer & penjualan",
    items: [
      { href: "/leads", label: "Leads", icon: BriefcaseBusiness, key: "leads", capability: "sales:view" },
      { href: "/customers", label: "Pelanggan & segmen", icon: Users, key: "customers", capability: "sales:view" },
      { href: "/products", label: "Katalog produk", icon: Package, key: "products", capability: "sales:view" },
      { href: "/transactions", label: "Pesanan & penjualan", icon: ShoppingBag, key: "transactions", capability: "finance:view" },
      { href: "/proposals", label: "Draft proposal", icon: FileText, key: "proposals", capability: "sales:operate" },
      { href: "/payments", label: "Pembayaran", icon: WalletCards, key: "payments", capability: "finance:view" },
      { href: "/receipts", label: "Review bukti bayar", icon: ReceiptText, key: "receipts", capability: "finance:view" },
      { href: "/reports", label: "Laporan", icon: TrendingUp, key: "reports", capability: "finance:view" },
    ],
  },
  automation: {
    title: "Otomatisasi",
    items: [
      { href: "/integrations", label: "Channel & integrasi", icon: Building2, key: "integrations", capability: "automation:manage" },
      { href: "/hours", label: "Jam kerja AI", icon: Clock3, key: "hours", capability: "automation:manage" },
      { href: "/complaints", label: "Manajemen komplain", icon: LifeBuoy, key: "complaints", capability: "operations:view" },
      { href: "/broadcasts", label: "Broadcast WhatsApp", icon: Megaphone, key: "broadcasts", capability: "automation:manage" },
      { href: "/orders", label: "Otomatisasi pesanan", icon: ShoppingBag, key: "orders", capability: "operations:view" },
      { href: "/shipping", label: "Cek ongkir", icon: Truck, key: "shipping", capability: "operations:view" },
      { href: "/workflows", label: "Workflow builder", icon: Workflow, key: "workflows", capability: "automation:manage" },
      { href: "/whatsapp", label: "Setup WhatsApp", icon: Code2, key: "whatsapp", capability: "automation:manage" },
      { href: "/readiness", label: "Pemeriksaan siap live", icon: BadgeCheck, key: "readiness", capability: "automation:manage" },
    ],
  },
  settings: {
    title: "Ruang kerja",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard", capability: "dashboard:view" },
      { href: "/business", label: "Profil bisnis", icon: Building2, key: "business", capability: "workspace:manage" },
      { href: "/setup", label: "Panduan setup", icon: BadgeCheck, key: "setup", capability: "workspace:manage" },
      { href: "/usage", label: "Penggunaan", icon: Activity, key: "usage", capability: "workspace:manage" },
      ...(isTeamManagementEnabled()
        ? [{ href: "/team", label: "Tim & akses", icon: Users, key: "team", capability: "team:manage" as const }]
        : []),
      { href: "/account", label: "Keamanan akun", icon: Settings, key: "account", capability: "account:view" },
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
  workspaceRole?: WorkspaceRoleValue;
};

export async function AppShell({
  active,
  businessName,
  children,
  workspaceRole: providedWorkspaceRole,
}: AppShellProps) {
  const session = providedWorkspaceRole ? null : await getSession();
  const workspaceRole = providedWorkspaceRole ?? session?.role ?? "VIEWER";
  const activeModule = moduleByActive[active] ?? "settings";
  const requestedNavigationItem = moduleNavigation[activeModule].items.find(
    (item) => item.key === active,
  );
  if (
    requestedNavigationItem &&
    !canWorkspace(workspaceRole, requestedNavigationItem.capability)
  ) {
    redirect(getWorkspaceHome(workspaceRole));
  }
  const visibleModuleNavigation = Object.fromEntries(
    Object.entries(moduleNavigation).map(([key, navigation]) => [
      key,
      {
        ...navigation,
        items: navigation.items.filter((item) => canWorkspace(workspaceRole, item.capability)),
      },
    ]),
  ) as Record<ModuleKey, { title: string; items: NavigationItem[] }>;
  const activeNavigation = visibleModuleNavigation[activeModule];
  const groqConfigured = Boolean(process.env.GROQ_API_KEY);

  return (
    <main
      className={`app-frame workspace-role-${workspaceRole.toLowerCase()}`}
      data-workspace-role={workspaceRole}
    >
      <ToastCenter />
      {workspaceRole === "OWNER" ? <OnboardingGuide /> : null}
      <header className="app-topbar">
        <div className="app-logo-menu">
          <Link className="app-logo" href={getWorkspaceHome(workspaceRole)} aria-label="Aijou AI dashboard">
            <AijouLogo size={30} />
            <span className="app-wordmark">
              <strong>Aijou AI</strong>
              <small>Sales workspace</small>
            </span>
          </Link>
          <div className="logo-popover" role="tooltip">
            <strong>Aijou AI</strong>
            <span>AI sales workspace untuk percakapan yang bergerak maju.</span>
            <Link href={getWorkspaceHome(workspaceRole)}>Buka ruang kerja</Link>
          </div>
        </div>

        <nav className="workspace-primary-nav" aria-label="Navigasi utama">
          {primaryNavigation.map((item) => {
            const firstVisibleItem = visibleModuleNavigation[item.module].items[0];
            if (!firstVisibleItem) return null;
            const Icon = item.icon;
            const isActive = item.module === activeModule;
            return (
              <IntentPrefetchLink
                className={isActive ? "top-nav-item active" : "top-nav-item"}
                href={firstVisibleItem.href}
                key={item.module}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                <span>{item.label}</span>
              </IntentPrefetchLink>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <Link className="top-icon-button" href={canWorkspace(workspaceRole, "workspace:manage") ? "/setup" : "/account"} aria-label="Bantuan" data-tooltip="Bantuan">
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

          <p className="sidebar-context-heading">{activeNavigation.title}</p>
          <div className={`workspace-role-badge workspace-role-${workspaceRole.toLowerCase()}`}>
            {getWorkspaceRoleLabel(workspaceRole)}
            {workspaceRole === "VIEWER" ? <small>Data hanya dapat dilihat</small> : null}
          </div>
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
