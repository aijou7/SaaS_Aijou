import { Bot, MessageCircle, Sparkles } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  simulateClientMessageAction,
  simulateFinanceMessageAction,
} from "@/app/simulator/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getConversationsInbox } from "@/server/conversations/conversations";
import { getFinanceDashboardSnapshot } from "@/server/finance/dashboard";

const financeExamples = [
  "Catat beli kabel LAN 2 roll 450 ribu buat project kantor A",
  "Ya",
  "Batal",
  "Rekap pengeluaran bulan ini",
];

const clientExamples = [
  "Halo, bisa bantu pasang jaringan LAN kantor?",
  "Berapa biaya pasang jaringan 12 titik?",
  "Saya mau bicara dengan admin",
];

export default async function SimulatorPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login" as Route);
  }

  const [dashboard, inbox] = await Promise.all([
    getFinanceDashboardSnapshot(session.userId),
    getConversationsInbox(session.userId),
  ]);

  return (
    <AppShell active="simulator" businessName={dashboard.businessName}>

        <section className="hero compact-hero">
          <p className="eyebrow">Demo loop</p>
          <h1>Rasakan app-nya seperti WhatsApp assistant sungguhan.</h1>
          <p>
            Simulasi ini mengisi database yang sama dengan webhook real, jadi dashboard,
            transactions, dan conversations langsung ikut berubah.
          </p>
        </section>

        <section className="grid" aria-label="Simulator summary">
          <div className="card">
            <Sparkles size={22} aria-hidden="true" />
            <h2>Revenue Bulan Ini</h2>
            <div className="metric">
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
              }).format(dashboard.totalThisMonth)}
            </div>
            <p className="muted">Order income yang sudah confirmed.</p>
          </div>
          <div className="card">
            <MessageCircle size={22} aria-hidden="true" />
            <h2>Human Needed</h2>
            <div className="metric">{inbox.summary.humanNeeded}</div>
            <p className="muted">Customer butuh owner/admin.</p>
          </div>
          <div className="card">
            <Bot size={22} aria-hidden="true" />
            <h2>Customer Chats</h2>
            <div className="metric">{inbox.summary.customerService}</div>
            <p className="muted">AI agent ringan untuk demo.</p>
          </div>
        </section>

        <section className="section simulator-grid">
          <div className="card">
            <h2>Finance Assistant</h2>
            <p className="muted">
              Coba kirim expense, lalu kirim Ya untuk confirm. Transaksi akan muncul di dashboard.
            </p>
            <form className="simulator-form" action={simulateFinanceMessageAction}>
              <input
                name="message"
                type="text"
                defaultValue={financeExamples[0]}
                placeholder="Catat beli mouse 150 ribu"
                required
              />
              <button className="primary-button" type="submit">
                Kirim
              </button>
            </form>
            <div className="quick-actions">
              {financeExamples.map((example) => (
                <form action={simulateFinanceMessageAction} key={example}>
                  <input name="message" type="hidden" value={example} />
                  <button className="ghost-button" type="submit">
                    {example}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Customer Chat + Takeover</h2>
            <p className="muted">
              Simulasi calon klien. Kalau customer minta admin/manusia, status jadi Human Needed.
            </p>
            <form className="form-grid" action={simulateClientMessageAction}>
              <label>
                Nama
                <input name="displayName" type="text" defaultValue="Bapak Andi" />
              </label>
              <label>
                Nomor
                <input name="phoneNumber" type="text" defaultValue="628123000111" />
              </label>
              <label className="span-2">
                Pesan
                <input
                  name="message"
                  type="text"
                  defaultValue={clientExamples[0]}
                  placeholder="Halo, bisa bantu pasang LAN?"
                  required
                />
              </label>
              <button className="primary-button span-2" type="submit">
                Simulate customer
              </button>
            </form>
            <div className="quick-actions">
              {clientExamples.map((example) => (
                <form action={simulateClientMessageAction} key={example}>
                  <input name="displayName" type="hidden" value="Bapak Andi" />
                  <input name="phoneNumber" type="hidden" value="628123000111" />
                  <input name="message" type="hidden" value={example} />
                  <button className="ghost-button" type="submit">
                    {example}
                  </button>
                </form>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="card">
            <div className="section-header">
              <h2>Latest Conversations</h2>
              <Link className="ghost-button" href="/conversations">
                Buka inbox
              </Link>
            </div>
            {inbox.conversations.length === 0 ? (
              <p className="muted">Belum ada conversation. Kirim simulasi dulu.</p>
            ) : (
              <div className="conversation-list">
                {inbox.conversations.slice(0, 5).map((conversation) => (
                  <Link
                    className="conversation-row"
                    href={`/conversations?conversationId=${conversation.id}`}
                    key={conversation.id}
                  >
                    <span>
                      <strong>{conversation.contactName}</strong>
                      <small>{conversation.lastMessage}</small>
                    </span>
                    <span
                      className={
                        conversation.status === "HUMAN_NEEDED"
                          ? "status status-warning"
                          : "status"
                      }
                    >
                      {conversation.status === "HUMAN_NEEDED" ? "Human Needed" : "AI Active"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
    </AppShell>
  );
}
