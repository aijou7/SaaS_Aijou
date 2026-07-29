import type { Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  escapeEmailHtml,
  getPublicAppUrl,
  sendTransactionalEmail,
} from "@/server/email";

export const humanTakeoverNotificationJob = "HUMAN_TAKEOVER_NOTIFICATION";
const humanTakeoverNotificationType = "HUMAN_TAKEOVER";

type NotificationTransaction = Prisma.TransactionClient;

export async function enqueueHumanTakeoverNotifications(
  tx: NotificationTransaction,
  params: {
    businessId: string;
    conversationId: string;
    triggerId: string;
    contactName: string;
    reason: string;
  },
) {
  const business = await tx.business.findUnique({
    where: { id: params.businessId },
    select: {
      userId: true,
      memberships: {
        where: {
          isActive: true,
          role: { in: ["OWNER", "ADMIN", "AGENT"] },
          user: { status: "ACTIVE" },
        },
        select: { userId: true },
      },
    },
  });
  if (!business) return { recipients: 0 };

  const recipientIds = [
    ...new Set([
      business.userId,
      ...business.memberships.map((membership) => membership.userId),
    ]),
  ];
  const safeContactName =
    params.contactName.trim().slice(0, 160) || "Customer";
  const href = `/conversations?conversationId=${encodeURIComponent(
    params.conversationId,
  )}`;

  await tx.workspaceNotification.createMany({
    data: recipientIds.map((userId) => ({
      businessId: params.businessId,
      userId,
      type: humanTakeoverNotificationType,
      title: "Percakapan butuh bantuan tim",
      body: `${safeContactName} perlu ditangani manusia. ${params.reason}`.slice(
        0,
        500,
      ),
      href,
      dedupeKey: `takeover:${params.triggerId}:${userId}`,
    })),
    skipDuplicates: true,
  });

  await tx.backgroundJob.upsert({
    where: {
      dedupeKey: `takeover-notify:${params.businessId}:${params.triggerId}`,
    },
    create: {
      businessId: params.businessId,
      type: humanTakeoverNotificationJob,
      dedupeKey: `takeover-notify:${params.businessId}:${params.triggerId}`,
      payload: {
        conversationId: params.conversationId,
        triggerId: params.triggerId,
      },
      maxAttempts: 8,
    },
    update: {},
  });

  return { recipients: recipientIds.length };
}

export async function deliverHumanTakeoverNotifications(
  businessId: string,
  payload: Prisma.JsonValue,
) {
  const object =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : null;
  const triggerId =
    object && typeof object.triggerId === "string" ? object.triggerId : "";
  if (!triggerId) {
    throw new Error("Human takeover notification trigger is missing.");
  }

  const notifications = await prisma.workspaceNotification.findMany({
    where: {
      businessId,
      type: humanTakeoverNotificationType,
      dedupeKey: { startsWith: `takeover:${triggerId}:` },
      emailedAt: null,
    },
    select: {
      id: true,
      title: true,
      body: true,
      href: true,
      user: { select: { email: true, name: true } },
    },
  });

  for (const notification of notifications) {
    const url = new URL(
      notification.href || "/conversations?status=HUMAN_NEEDED",
      getPublicAppUrl(),
    ).toString();
    const result = await sendTransactionalEmail({
      to: notification.user.email,
      subject: notification.title,
      idempotencyKey: notification.id,
      text: `${notification.body}\n\nBuka percakapan: ${url}`,
      html: `<!doctype html><html><body style="margin:0;background:#f4f1ea;color:#171a17;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fff;padding:32px;border-radius:18px"><p style="font-size:13px;color:#5f746a">AIJOU AI</p><h1 style="font-size:25px">${escapeEmailHtml(notification.title)}</h1><p>Halo ${escapeEmailHtml(notification.user.name)},</p><p>${escapeEmailHtml(notification.body)}</p><p style="margin:28px 0"><a href="${escapeEmailHtml(url)}" style="background:#183f35;color:#fff;padding:13px 18px;border-radius:10px;text-decoration:none">Buka percakapan</a></p></div></body></html>`,
    });

    await prisma.workspaceNotification.update({
      where: { id: notification.id },
      data: {
        emailedAt: result.sent ? new Date() : null,
        emailError: result.sent ? null : result.error,
      },
    });

    if (result.configured && !result.sent) {
      throw new Error(`Notification email failed: ${result.error}`);
    }
  }
}

export async function getNotificationCenter(userId: string, limit = 30) {
  const safeLimit = Math.min(100, Math.max(1, Math.round(limit)));
  const [notifications, unread] = await Promise.all([
    prisma.workspaceNotification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        href: true,
        readAt: true,
        emailedAt: true,
        createdAt: true,
      },
    }),
    prisma.workspaceNotification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    unread,
    notifications: notifications.map((notification) => ({
      ...notification,
      readAt: notification.readAt?.toISOString() ?? null,
      emailedAt: notification.emailedAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    })),
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  if (!notificationId || notificationId.length > 180) return;
  await prisma.workspaceNotification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.workspaceNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
