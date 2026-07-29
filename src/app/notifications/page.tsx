import { Bell, CheckCheck, MailCheck } from "lucide-react";
import { redirect } from "next/navigation";
import {
  markAllNotificationsReadAction,
  openNotificationAction,
} from "@/app/notifications/actions";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/session";
import { getNotificationCenter } from "@/server/notifications/notifications";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const center = await getNotificationCenter(session.userId, 50);

  return (
    <AppShell active="notifications" businessName={session.business?.businessName}>
      <section className="hero compact-hero">
        <p className="eyebrow">Notifikasi tim</p>
        <h1>Chat yang butuh manusia tidak lagi terlewat.</h1>
        <p>
          Aijou menyimpan notifikasi di dashboard dan mengirim email ke owner,
          admin, serta agent aktif.
        </p>
      </section>

      <section className="section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Inbox operasional</p>
            <h2>{center.unread} belum dibaca</h2>
          </div>
          {center.unread > 0 ? (
            <form action={markAllNotificationsReadAction}>
              <button className="ghost-button" type="submit">
                <CheckCheck size={16} aria-hidden="true" />
                Tandai semua dibaca
              </button>
            </form>
          ) : null}
        </div>

        {center.notifications.length === 0 ? (
          <div className="empty-state">
            <Bell size={24} aria-hidden="true" />
            <strong>Belum ada notifikasi</strong>
            <p>Permintaan human takeover akan muncul di sini.</p>
          </div>
        ) : (
          <div className="notification-list">
            {center.notifications.map((notification) => (
              <form action={openNotificationAction} key={notification.id}>
                <input name="notificationId" type="hidden" value={notification.id} />
                <input name="href" type="hidden" value={notification.href ?? "/conversations"} />
                <button
                  className={
                    notification.readAt
                      ? "notification-row"
                      : "notification-row unread"
                  }
                  type="submit"
                >
                  <span className="notification-row-icon">
                    {notification.emailedAt ? (
                      <MailCheck size={18} aria-hidden="true" />
                    ) : (
                      <Bell size={18} aria-hidden="true" />
                    )}
                  </span>
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.body}</small>
                  </span>
                  <time>{formatDate(notification.createdAt)}</time>
                </button>
              </form>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
