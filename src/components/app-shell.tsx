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
  { href: "/conversations", label: "Inbox", icon: MessageCircle, module: "inbox" as ModuleKey },
  { href: "/agent", label: "AI Agent", icon: Bot, module: "agent" as ModuleKey },
  { href: "/training", label: "Training", icon: Tags, module: "training" as ModuleKey },
  { href: "/products", label: "Products", icon: Package, module: "products" as ModuleKey },
  { href: "/payments", label: "Payments", icon: WalletCards, module: "payments" as ModuleKey },
  { href: "/reports", label: "Reports", icon: TrendingUp, module: "reports" as ModuleKey },
  { href: "/integrations", label: "Integrations", icon: Building2, module: "integrations" as ModuleKey },
];

const moduleNavigation: Record<ModuleKey, { title: string; items: NavigationItem[] }> = {
  settings: {
    title: "Workspace",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
      { href: "/setup", label: "Setup Wizard", icon: BadgeCheck, key: "setup" },
      { href: "/usage", label: "Usage", icon: Activity, key: "usage" },
    ],
  },
  inbox: {
    title: "Inbox",
    items: [
      { href: "/conversations", label: "Live Chat", icon: MessageCircle, key: "conversations" },
      { href: "/conversations?status=HUMAN_NEEDED", label: "Human Takeover", icon: Send, key: "human-takeover" },
      { href: "/simulator", label: "Test Simulator", icon: Zap, key: "simulator" },
    ],
  },
  agent: {
    title: "AI Agent",
    items: [
      { href: "/agent", label: "Behavior", icon: Bot, key: "agent" },
      { href: "/ai-activity", label: "AI Logs", icon: Activity, key: "ai-activity" },
    ],
  },
  training: {
    title: "Training",
    items: [
      { href: "/training", label: "Knowledge", icon: Tags, key: "training" },
      { href: "/knowledge", label: "Legacy KB", icon: ReceiptText, key: "knowledge" },
      { href: "/simulator", label: "Import Chat Sample", icon: MessageCircle, key: "training-import" },
    ],
  },
  products: {
    title: "Products",
    items: [
      { href: "/products", label: "Catalog", icon: Package, key: "products" },
      { href: "/transactions?view=create", label: "Create Order", icon: CheckCircle2, key: "order-create" },
    ],
  },
  payments: {
    title: "Payments",
    items: [
      { href: "/payments", label: "Payment Setup", icon: WalletCards, key: "payments" },
      { href: "/transactions", label: "Orders & Sales", icon: Package, key: "transactions" },
      { href: "/transactions?view=payment-settings", label: "Xendit Settings", icon: ReceiptText, key: "xendit-settings" },
    ],
  },
  reports: {
    title: "Reports",
    items: [
      { href: "/reports", label: "Dashboard", icon: TrendingUp, key: "reports" },
      { href: "/transactions", label: "Sales Report", icon: WalletCards, key: "report-sales" },
      { href: "/ai-activity", label: "AI Performance", icon: Activity, key: "report-ai" },
    ],
  },
  integrations: {
    title: "Integrations",
    items: [
      { href: "/integrations", label: "Platforms", icon: Building2, key: "integrations" },
      { href: "/whatsapp", label: "WhatsApp", icon: Code2, key: "whatsapp" },
      { href: "/readiness", label: "Go Live Check", icon: BadgeCheck, key: "readiness" },
    ],
  },
};

const moduleByActive: Record<string, ModuleKey> = {
  dashboard: "settings",
  setup: "settings",
  usage: "settings",
  conversations: "inbox",
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
          <Link className="app-logo" href="/" aria-label="Dashboard">
            <Bot size={20} aria-hidden="true" />
          </Link>
          <div className="logo-popover" role="tooltip">
            <strong>WA AI Assistant</strong>
            <span>Dashboard, setup, and workspace overview.</span>
            <Link href="/">Open dashboard</Link>
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
              <div className="account-avatar">W</div>
              <div>
                <strong>{businessName ?? "WA AI Assistant"}</strong>
                <span>{groqConfigured ? "AI connected" : "Local workspace"}</span>
              </div>
            </div>

            <label className="settings-search">
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Search" />
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
                  <small>Super Agent</small>
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
                <p className="workspace-kicker">Workspace</p>
                <strong>{activeSettingsItem?.label ?? "Dashboard"}</strong>
              </div>
              <div className="workspace-meta" aria-label="Workspace status">
                <span className="meta-pill">
                  <BadgeCheck size={14} aria-hidden="true" />
                  Local ready
                </span>
                <span className={groqConfigured ? "meta-pill" : "meta-pill meta-pill-warning"}>
                  <Zap size={14} aria-hidden="true" />
                  {groqConfigured ? "Groq active" : "Groq setup"}
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
