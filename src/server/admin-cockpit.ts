import { BackgroundJobStatus, UserStatus } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { getAdminFeedback, requirePlatformAdmin } from "@/server/feedback";
import { isTransactionalEmailConfigured } from "@/server/email";

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
    select: { isPlatformAdmin: true },
  });
  if (!target || target.isPlatformAdmin) throw new Error("Akun platform admin dilindungi.");
  return prisma.user.update({
    where: { id: targetUserId },
    data: {
      status,
      suspendedAt: status === UserStatus.SUSPENDED ? new Date() : null,
      ...(status === UserStatus.ACTIVE ? { deletionRequestedAt: null } : {}),
    },
  });
}

export async function replayFailedJobAsAdmin(adminUserId: string, jobId: string) {
  await requirePlatformAdmin(adminUserId);
  return prisma.backgroundJob.updateMany({
    where: { id: jobId, status: BackgroundJobStatus.FAILED },
    data: {
      status: BackgroundJobStatus.PENDING,
      attempts: 0,
      runAfter: new Date(),
      lockedAt: null,
      lastError: null,
      completedAt: null,
    },
  });
}

