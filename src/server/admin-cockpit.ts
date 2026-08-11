import {
  BackgroundJobStatus,
  Prisma,
  SubscriptionBillingCycle,
  SubscriptionPlan,
  UserStatus,
  WorkspaceSubscriptionStatus,
} from "@/generated/prisma-beta/client";
import { isLoginOtpEnabled } from "@/lib/auth-flags";
import { prisma } from "@/lib/prisma";
import { getAdminFeedback, requirePlatformAdmin } from "@/server/feedback";
import {
  getTransactionalEmailProvider,
  isTransactionalEmailConfigured,
} from "@/server/email";
import { getPublicTrialAvailability } from "@/server/subscriptions/subscriptions";

export class DeveloperConsoleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DeveloperConsoleError";
  }
}

export function getSafeDeveloperConsoleError(error: unknown) {
  if (error instanceof DeveloperConsoleError) return error.message;
  return "Perubahan belum berhasil disimpan. Coba lagi.";
}

export async function getAdminCockpit(userId: string) {
  await requirePlatformAdmin(userId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const [users, feedback, failedJobs, pendingJobs, usage, totalUsers, activeUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        isPlatformAdmin: true,
        emailVerifiedAt: true,
        signupSource: true,
        lastLoginAt: true,
        lastSeenAt: true,
        createdAt: true,
        businesses: {
          take: 1,
          select: {
            id: true,
            businessName: true,
            onboardingCompleted: true,
            widgetLastSeenAt: true,
            agentSettings: { select: { isActive: true } },
            whatsAppSettings: { select: { isActive: true } },
            telegramSettings: { select: { isActive: true, lastError: true } },
            activationEvents: { orderBy: { createdAt: "asc" }, select: { type: true, createdAt: true } },
            _count: { select: { conversations: true, feedback: true, memberships: true } },
          },
        },
      },
    }),
    getAdminFeedback(),
    prisma.backgroundJob.findMany({
      where: { status: BackgroundJobStatus.FAILED },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        businessId: true,
        type: true,
        attempts: true,
        maxAttempts: true,
        lastError: true,
        updatedAt: true,
        business: { select: { businessName: true } },
      },
    }),
    prisma.backgroundJob.aggregate({
      where: { status: { in: [BackgroundJobStatus.PENDING, BackgroundJobStatus.PROCESSING] } },
      _count: true,
      _min: { createdAt: true },
    }),
    prisma.usageLog.aggregate({
      where: { createdAt: { gte: since } },
      _sum: { totalAiRequests: true, inputTokens: true, outputTokens: true, estimatedCost: true },
      _avg: { latencyMs: true },
      _count: true,
    }),
    prisma.user.count(),
    prisma.user.count({ where: { status: UserStatus.ACTIVE, lastSeenAt: { gte: since } } }),
  ]);

  return {
    users,
    feedback,
    failedJobs,
    pendingJobs: pendingJobs._count,
    oldestPendingAt: pendingJobs._min.createdAt,
    usage,
    totalUsers,
    activeUsers,
    emailConfigured: isTransactionalEmailConfigured(),
    emailProvider: getTransactionalEmailProvider(),
    loginOtpEnabled: isLoginOtpEnabled(),
  };
}

export async function getDeveloperConsole(
  userId: string,
  filters: { q?: string; subscriptionStatus?: string } = {},
) {
  await requirePlatformAdmin(userId);
  const query = filters.q?.trim().slice(0, 120) ?? "";
  const subscriptionStatus = Object.values(WorkspaceSubscriptionStatus).includes(
    filters.subscriptionStatus as WorkspaceSubscriptionStatus,
  )
    ? (filters.subscriptionStatus as WorkspaceSubscriptionStatus)
    : undefined;
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [activeUsers, failedJobs, workspaces, groupedSubscriptions, payments, audits, trial, aiUsage, expiringSoon] =
    await Promise.all([
      prisma.user.count({ where: { status: UserStatus.ACTIVE, lastSeenAt: { gte: since } } }),
      prisma.backgroundJob.findMany({
        where: { status: BackgroundJobStatus.FAILED },
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          businessId: true,
          type: true,
          attempts: true,
          maxAttempts: true,
          lastError: true,
          updatedAt: true,
          business: { select: { businessName: true } },
        },
      }),
      prisma.business.findMany({
        where: {
          ...(query
            ? {
                OR: [
                  { businessName: { contains: query, mode: "insensitive" as const } },
                  { user: { email: { contains: query, mode: "insensitive" as const } } },
                  { user: { name: { contains: query, mode: "insensitive" as const } } },
                ],
              }
            : {}),
          ...(subscriptionStatus ? { subscription: { status: subscriptionStatus } } : {}),
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          businessName: true,
          onboardingCompleted: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              emailVerifiedAt: true,
              lastSeenAt: true,
              isPlatformAdmin: true,
            },
          },
          subscription: true,
          agentSettings: { select: { isActive: true } },
          whatsAppSettings: { select: { isActive: true } },
          telegramSettings: { select: { isActive: true } },
          _count: { select: { memberships: true, conversations: true, contacts: true } },
        },
      }),
      prisma.workspaceSubscription.groupBy({ by: ["status"], _count: true }),
      prisma.subscriptionPayment.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        select: {
          orderId: true,
          amount: true,
          status: true,
          plan: true,
          billingCycle: true,
          createdAt: true,
          settledAt: true,
          business: { select: { businessName: true } },
        },
      }),
      prisma.platformAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          reason: true,
          createdAt: true,
          actor: { select: { name: true, email: true } },
          business: { select: { businessName: true } },
        },
      }),
      getPublicTrialAvailability(),
      prisma.usageLog.aggregate({
        where: { createdAt: { gte: since } },
        _sum: { totalAiRequests: true, inputTokens: true, outputTokens: true },
        _avg: { latencyMs: true },
      }),
      prisma.workspaceSubscription.count({
        where: {
          status: WorkspaceSubscriptionStatus.TRIALING,
          trialEndsAt: { lte: new Date(Date.now() + 7 * 86_400_000) },
        },
      }),
    ]);

  const subscriptionCounts = Object.fromEntries(
    groupedSubscriptions.map((item) => [item.status, item._count]),
  ) as Partial<Record<WorkspaceSubscriptionStatus, number>>;
  return {
    activeUsers,
    failedJobs,
    workspaces,
    payments,
    audits,
    trial,
    aiUsage,
    subscriptionCounts,
    totalWorkspaces: groupedSubscriptions.reduce((total, item) => total + item._count, 0),
    expiringSoon,
  };
}

export async function setUserStatusAsAdmin(
  adminUserId: string,
  targetUserId: string,
  status: UserStatus,
) {
  await requirePlatformAdmin(adminUserId);
  if (adminUserId === targetUserId) throw new Error("Admin tidak bisa menonaktifkan akun sendiri.");
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      isPlatformAdmin: true,
      status: true,
      businesses: { take: 1, select: { id: true } },
    },
  });
  if (!target || target.isPlatformAdmin) throw new Error("Akun platform admin dilindungi.");
  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: targetUserId },
      data: {
        status,
        suspendedAt: status === UserStatus.SUSPENDED ? new Date() : null,
        ...(status === UserStatus.ACTIVE ? { deletionRequestedAt: null } : {}),
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorId: adminUserId,
        businessId: target.businesses[0]?.id,
        targetType: "user",
        targetId: targetUserId,
        action: status === UserStatus.SUSPENDED ? "user_suspended" : "user_reactivated",
        reason: "Tindakan keamanan dari developer console",
        beforeJson: { status: target.status },
        afterJson: { status },
      },
    });
    return updated;
  });
}

export async function activateWorkspacePlanAsAdmin(
  adminUserId: string,
  input: {
    businessId: string;
    plan: string;
    billingCycle: string;
    durationDays: number;
    reason: string;
  },
) {
  await requirePlatformAdmin(adminUserId);
  const plan = parsePaidPlan(input.plan);
  const billingCycle = input.billingCycle === SubscriptionBillingCycle.ANNUAL
    ? SubscriptionBillingCycle.ANNUAL
    : SubscriptionBillingCycle.MONTHLY;
  const durationDays = Math.trunc(input.durationDays);
  const reason = cleanReason(input.reason);
  if (durationDays < 1 || durationDays > 366) {
    throw new DeveloperConsoleError("INVALID_DURATION", "Masa aktif harus 1–366 hari.");
  }
  const now = new Date();
  const periodEnd = new Date(now.getTime() + durationDays * 86_400_000);

  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({
      where: { id: input.businessId },
      select: { id: true, subscription: true },
    });
    if (!business) throw new DeveloperConsoleError("NOT_FOUND", "Workspace tidak ditemukan.");
    const subscription = await tx.workspaceSubscription.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        plan,
        billingCycle,
        status: WorkspaceSubscriptionStatus.ACTIVE,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEnd,
        activatedAt: now,
      },
      update: {
        plan,
        billingCycle,
        status: WorkspaceSubscriptionStatus.ACTIVE,
        currentPeriodStartsAt: now,
        currentPeriodEndsAt: periodEnd,
        graceEndsAt: null,
        canceledAt: null,
        cancelAtPeriodEnd: false,
        activatedAt: now,
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorId: adminUserId,
        businessId: business.id,
        targetType: "workspace_subscription",
        targetId: subscription.id,
        action: "subscription_manually_activated",
        reason,
        beforeJson: toAuditJson(business.subscription),
        afterJson: {
          plan,
          billingCycle,
          status: WorkspaceSubscriptionStatus.ACTIVE,
          currentPeriodEndsAt: periodEnd.toISOString(),
        },
      },
    });
    return subscription;
  });
}

export async function adjustWorkspaceTrialAsAdmin(
  adminUserId: string,
  input: { businessId: string; operation: "EXTEND" | "END"; days?: number; reason: string },
) {
  await requirePlatformAdmin(adminUserId);
  const reason = cleanReason(input.reason);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const subscription = await tx.workspaceSubscription.findUnique({
      where: { businessId: input.businessId },
    });
    if (!subscription) throw new DeveloperConsoleError("NOT_FOUND", "Paket workspace tidak ditemukan.");
    if (!subscription.trialClaimNumber) {
      throw new DeveloperConsoleError(
        "NOT_TRIAL_RECIPIENT",
        "Workspace ini bukan penerima kuota 100 trial pertama.",
      );
    }

    const data: Prisma.WorkspaceSubscriptionUpdateInput = input.operation === "END"
      ? { status: WorkspaceSubscriptionStatus.EXPIRED, trialEndsAt: now }
      : buildTrialExtension(subscription.trialEndsAt, input.days, now);
    const updated = await tx.workspaceSubscription.update({
      where: { id: subscription.id },
      data,
    });
    await tx.platformAuditLog.create({
      data: {
        actorId: adminUserId,
        businessId: input.businessId,
        targetType: "workspace_subscription",
        targetId: subscription.id,
        action: input.operation === "END" ? "trial_ended_manually" : "trial_extended",
        reason,
        beforeJson: toAuditJson(subscription),
        afterJson: toAuditJson(updated),
      },
    });
    return updated;
  });
}

export async function replayFailedJobAsAdmin(adminUserId: string, jobId: string) {
  await requirePlatformAdmin(adminUserId);
  return prisma.$transaction(async (tx) => {
    const job = await tx.backgroundJob.findUnique({
      where: { id: jobId },
      select: { id: true, businessId: true, type: true, status: true, attempts: true, lastError: true },
    });
    if (!job || job.status !== BackgroundJobStatus.FAILED) return { count: 0 };

    const updated = await tx.backgroundJob.updateMany({
      where: { id: job.id, status: BackgroundJobStatus.FAILED },
      data: {
        status: BackgroundJobStatus.PENDING,
        attempts: 0,
        runAfter: new Date(),
        lockedAt: null,
        lastError: null,
        completedAt: null,
      },
    });
    if (updated.count > 0) {
      await tx.platformAuditLog.create({
        data: {
          actorId: adminUserId,
          businessId: job.businessId,
          targetType: "background_job",
          targetId: job.id,
          action: "background_job_replayed",
          reason: "Retry manual dari developer console",
          beforeJson: { status: job.status, attempts: job.attempts, lastError: job.lastError },
          afterJson: { status: BackgroundJobStatus.PENDING, attempts: 0 },
        },
      });
    }
    return updated;
  });
}

export async function recordPlatformAdminAction(
  adminUserId: string,
  input: {
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    after?: unknown;
  },
) {
  await requirePlatformAdmin(adminUserId);
  return prisma.platformAuditLog.create({
    data: {
      actorId: adminUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      reason: input.reason,
      afterJson: toAuditJson(input.after),
    },
  });
}

function parsePaidPlan(value: string) {
  if (value === SubscriptionPlan.STARTER) return SubscriptionPlan.STARTER;
  if (value === SubscriptionPlan.GROWTH) return SubscriptionPlan.GROWTH;
  if (value === SubscriptionPlan.BUSINESS) return SubscriptionPlan.BUSINESS;
  throw new DeveloperConsoleError("INVALID_PLAN", "Paket berbayar tidak valid.");
}

function cleanReason(value: string) {
  const reason = value.trim().replace(/\s+/g, " ").slice(0, 500);
  if (reason.length < 8) {
    throw new DeveloperConsoleError(
      "REASON_REQUIRED",
      "Tulis alasan minimal 8 karakter agar perubahan dapat diaudit.",
    );
  }
  return reason;
}

function buildTrialExtension(trialEndsAt: Date | null, daysInput: number | undefined, now: Date) {
  const days = Math.trunc(daysInput ?? 0);
  if (days < 1 || days > 30) {
    throw new DeveloperConsoleError("INVALID_DURATION", "Perpanjangan trial harus 1–30 hari.");
  }
  const baseline = trialEndsAt && trialEndsAt > now ? trialEndsAt : now;
  return {
    status: WorkspaceSubscriptionStatus.TRIALING,
    trialEndsAt: new Date(baseline.getTime() + days * 86_400_000),
    trialReminder7SentAt: null,
    trialReminder3SentAt: null,
    trialReminder1SentAt: null,
    trialExpiredNotifiedAt: null,
  } satisfies Prisma.WorkspaceSubscriptionUpdateInput;
}

function toAuditJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
