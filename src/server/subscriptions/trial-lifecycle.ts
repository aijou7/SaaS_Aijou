import { WorkspaceSubscriptionStatus } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import {
  escapeEmailHtml,
  getPublicAppUrl,
  sendTransactionalEmail,
} from "@/server/email";

type ReminderStage = "D7" | "D3" | "D1" | "EXPIRED";
const dayMs = 86_400_000;

export async function processTrialLifecycle(now = new Date()) {
  const candidates = await prisma.workspaceSubscription.findMany({
    where: {
      status: { in: [WorkspaceSubscriptionStatus.TRIALING, WorkspaceSubscriptionStatus.EXPIRED] },
      trialEndsAt: { not: null, lte: new Date(now.getTime() + 7 * dayMs) },
    },
    take: 150,
    orderBy: { trialEndsAt: "asc" },
    select: {
      id: true,
      status: true,
      plan: true,
      trialEndsAt: true,
      trialReminder7SentAt: true,
      trialReminder3SentAt: true,
      trialReminder1SentAt: true,
      trialExpiredNotifiedAt: true,
      business: {
        select: {
          businessName: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  });

  const result = { inspected: candidates.length, expired: 0, emailsSent: 0, emailFailures: 0 };
  for (const subscription of candidates) {
    if (!subscription.trialEndsAt) continue;
    const remainingMs = subscription.trialEndsAt.getTime() - now.getTime();
    const stage: ReminderStage = remainingMs <= 0
      ? "EXPIRED"
      : remainingMs <= dayMs
        ? "D1"
        : remainingMs <= 3 * dayMs
          ? "D3"
          : "D7";

    if (stage === "EXPIRED" && subscription.status === WorkspaceSubscriptionStatus.TRIALING) {
      const expired = await prisma.workspaceSubscription.updateMany({
        where: { id: subscription.id, status: WorkspaceSubscriptionStatus.TRIALING },
        data: { status: WorkspaceSubscriptionStatus.EXPIRED },
      });
      result.expired += expired.count;
    }

    if (alreadySent(subscription, stage)) continue;
    const claimed = await claimReminder(subscription.id, stage, now);
    if (!claimed) continue;

    const delivery = await sendTransactionalEmail(buildTrialEmail({
      subscriptionId: subscription.id,
      stage,
      name: subscription.business.user.name,
      email: subscription.business.user.email,
      businessName: subscription.business.businessName,
      plan: subscription.plan,
      trialEndsAt: subscription.trialEndsAt,
    }));
    if (delivery.sent) {
      result.emailsSent += 1;
    } else {
      result.emailFailures += 1;
      await releaseReminder(subscription.id, stage, now);
    }
  }
  return result;
}

function alreadySent(
  subscription: {
    trialReminder7SentAt: Date | null;
    trialReminder3SentAt: Date | null;
    trialReminder1SentAt: Date | null;
    trialExpiredNotifiedAt: Date | null;
  },
  stage: ReminderStage,
) {
  if (stage === "D7") return Boolean(subscription.trialReminder7SentAt);
  if (stage === "D3") return Boolean(subscription.trialReminder3SentAt);
  if (stage === "D1") return Boolean(subscription.trialReminder1SentAt);
  return Boolean(subscription.trialExpiredNotifiedAt);
}

async function claimReminder(id: string, stage: ReminderStage, now: Date) {
  const field = reminderField(stage);
  const result = await prisma.workspaceSubscription.updateMany({
    where: {
      id,
      [field]: null,
      ...(stage === "EXPIRED"
        ? { status: WorkspaceSubscriptionStatus.EXPIRED }
        : { status: WorkspaceSubscriptionStatus.TRIALING, trialEndsAt: { gt: now } }),
    },
    data: { [field]: now },
  });
  return result.count === 1;
}

async function releaseReminder(id: string, stage: ReminderStage, claimedAt: Date) {
  const field = reminderField(stage);
  await prisma.workspaceSubscription.updateMany({
    where: { id, [field]: claimedAt },
    data: { [field]: null },
  });
}

function reminderField(stage: ReminderStage) {
  if (stage === "D7") return "trialReminder7SentAt" as const;
  if (stage === "D3") return "trialReminder3SentAt" as const;
  if (stage === "D1") return "trialReminder1SentAt" as const;
  return "trialExpiredNotifiedAt" as const;
}

function buildTrialEmail(input: {
  subscriptionId: string;
  stage: ReminderStage;
  name: string;
  email: string;
  businessName: string;
  plan: string;
  trialEndsAt: Date;
}) {
  const expired = input.stage === "EXPIRED";
  const days = input.stage === "D7" ? 7 : input.stage === "D3" ? 3 : 1;
  const subject = expired
    ? `Trial Aijou untuk ${input.businessName} sudah berakhir`
    : `Trial Aijou tersisa ${days} hari`;
  const appUrl = getPublicAppUrl();
  const safeName = escapeEmailHtml(input.name);
  const safeBusiness = escapeEmailHtml(input.businessName);
  const statusText = expired
    ? "AI auto-reply dihentikan, tetapi data dan kotak masuk tetap aman serta dapat ditangani oleh tim."
    : `Trial paket ${input.plan} akan berakhir pada ${formatDate(input.trialEndsAt)}.`;
  return {
    to: input.email,
    subject,
    text: `Halo ${input.name}, ${statusText} Buka ${appUrl}/subscription untuk melihat pilihan paket.`,
    html: `<p>Halo ${safeName},</p><p><strong>${safeBusiness}</strong>: ${escapeEmailHtml(statusText)}</p><p><a href="${appUrl}/subscription">Lihat paket Aijou</a></p>`,
    idempotencyKey: `trial-${input.subscriptionId}-${input.stage.toLowerCase()}`,
  };
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "long",
    timeZone: "Asia/Makassar",
  }).format(value);
}
