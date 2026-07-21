import { FeedbackCategory, FeedbackStatus, WorkspaceRole } from "@/generated/prisma-beta/client";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import { prisma } from "@/lib/prisma";
import { FeedbackSubmissionError } from "@/server/feedback-errors";
import { requireWorkspaceAccess } from "@/server/workspace-access";

export async function getFeedbackPage(userId: string) {
  const access = await requireWorkspaceAccess(userId);
  const [business, feedback] = await Promise.all([
    prisma.business.findUnique({
      where: { id: access.businessId },
      select: { businessName: true },
    }),
    prisma.feedback.findMany({
      where: { businessId: access.businessId, submittedById: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        category: true,
        status: true,
        title: true,
        message: true,
        rating: true,
        adminResponse: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  return { business, feedback };
}

export async function createFeedback(
  userId: string,
  input: {
    category: string;
    title: string;
    message: string;
    rating?: number | null;
    pageUrl?: string | null;
    userAgent?: string | null;
  },
) {
  const access = await requireWorkspaceAccess(userId);
  const limit = await consumeDurableRateLimit(`${access.businessId}:${userId}`, [
    { scope: "feedback:user:1h", max: 20, windowMs: 60 * 60_000 },
    { scope: "feedback:user:24h", max: 60, windowMs: 24 * 60 * 60_000 },
  ]);
  if (!limit.allowed) throw new FeedbackSubmissionError("RATE_LIMITED");

  const category = Object.values(FeedbackCategory).includes(input.category as FeedbackCategory)
    ? (input.category as FeedbackCategory)
    : FeedbackCategory.OTHER;
  const title = clean(input.title, 120);
  const message = clean(input.message, 4_000);
  if (title.length < 3) throw new FeedbackSubmissionError("TITLE_TOO_SHORT");
  if (message.length < 10) throw new FeedbackSubmissionError("MESSAGE_TOO_SHORT");
  const rating = input.rating && input.rating >= 1 && input.rating <= 5
    ? Math.round(input.rating)
    : null;

  return prisma.feedback.create({
    data: {
      businessId: access.businessId,
      submittedById: userId,
      category,
      title,
      message,
      rating,
      pageUrl: normalizePageUrl(input.pageUrl),
      userAgent: clean(input.userAgent ?? "", 500) || null,
    },
  });
}

export async function getAdminFeedback() {
  return prisma.feedback.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      business: { select: { businessName: true } },
      submittedBy: { select: { name: true, email: true } },
    },
  });
}

export async function updateFeedbackAsAdmin(
  adminUserId: string,
  feedbackId: string,
  input: { status: string; response?: string | null },
) {
  await requirePlatformAdmin(adminUserId);
  const status = Object.values(FeedbackStatus).includes(input.status as FeedbackStatus)
    ? (input.status as FeedbackStatus)
    : FeedbackStatus.IN_REVIEW;
  return prisma.feedback.update({
    where: { id: feedbackId },
    data: {
      status,
      adminResponse: clean(input.response ?? "", 4_000) || null,
      resolvedAt:
        status === FeedbackStatus.RESOLVED || status === FeedbackStatus.CLOSED
        ? new Date()
        : null,
    },
  });
}

export async function requirePlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true, status: true },
  });
  if (!user?.isPlatformAdmin || user.status === "SUSPENDED") {
    throw new Error("Akses platform admin diperlukan.");
  }
}

export const feedbackCategoryLabels: Record<FeedbackCategory, string> = {
  BUG: "Bug",
  IDEA: "Ide fitur",
  CONFUSING: "Membingungkan",
  SUPPORT: "Butuh bantuan",
  OTHER: "Lainnya",
};

function clean(value: string, max: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function normalizePageUrl(value?: string | null) {
  const page = value?.trim().slice(0, 500) ?? "";
  return page.startsWith("/") && !page.startsWith("//") ? page : null;
}
