import { createHash, randomBytes } from "node:crypto";
import {
  AuthTokenPurpose,
  BackgroundJobStatus,
  Prisma,
  UserStatus,
} from "@/generated/prisma-beta/client";
import {
  consumeDurableRateLimit,
  type DurableRateRule,
} from "@/lib/durable-rate-limit";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  cleanupPersistedReceiptMedia,
  receiptMediaSnapshotsMatch,
  type PersistedReceiptMediaSnapshot,
} from "@/server/auth/account-media-cleanup";
import {
  escapeEmailHtml,
  getPublicAppUrl,
  sendTransactionalEmail,
} from "@/server/email";

const resetRules = [
  { scope: "password-reset:subject:15m", max: 4, windowMs: 15 * 60_000 },
  { scope: "password-reset:subject:24h", max: 12, windowMs: 24 * 60 * 60_000 },
] as const satisfies readonly DurableRateRule[];
const verificationRules = [
  { scope: "email-verification:user:15m", max: 3, windowMs: 15 * 60_000 },
  { scope: "email-verification:user:24h", max: 10, windowMs: 24 * 60 * 60_000 },
] as const satisfies readonly DurableRateRule[];

export class AccountLifecycleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AccountLifecycleError";
  }
}

export async function requestPasswordReset(emailValue: string, clientIp: string) {
  const email = normalizeEmail(emailValue);
  const [emailLimit, ipLimit] = await Promise.all([
    consumeDurableRateLimit(email || "invalid", resetRules),
    consumeDurableRateLimit((clientIp || "unknown").slice(0, 64), resetRules),
  ]);
  if (!emailLimit.allowed || !ipLimit.allowed || !email) return { accepted: true };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, status: true },
  });
  if (!user || !isAccountRecoveryAllowed(user.status)) return { accepted: true };

  const token = await issueToken(user.id, AuthTokenPurpose.PASSWORD_RESET, 60 * 60_000);
  const url = `${getPublicAppUrl()}/reset-password?token=${encodeURIComponent(token.value)}`;
  await deliverIssuedTokenEmail(token, {
    to: user.email,
    subject: "Reset password Aijou AI",
    idempotencyKey: `password-reset-${token.id}`,
    text: `Halo ${user.name}, buka link ini untuk membuat password baru. Link berlaku 60 menit dan hanya bisa dipakai sekali:\n\n${url}\n\nJika bukan kamu yang meminta, abaikan email ini.`,
    html: emailTemplate({
      title: "Buat password baru",
      greeting: `Halo ${user.name},`,
      message: "Gunakan tombol berikut dalam 60 menit. Link hanya bisa dipakai sekali.",
      actionLabel: "Reset password",
      actionUrl: url,
      footnote: "Jika bukan kamu yang meminta, abaikan email ini.",
    }),
  });
  return { accepted: true };
}

export async function resetPasswordWithToken(tokenValue: string, newPassword: string) {
  const tokenHash = hashToken(tokenValue);
  const token = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      purpose: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, status: true } },
    },
  });
  if (
    !token ||
    token.purpose !== AuthTokenPurpose.PASSWORD_RESET ||
    token.usedAt ||
    token.expiresAt <= new Date() ||
    !isAccountRecoveryAllowed(token.user.status)
  ) {
    throw new AccountLifecycleError("INVALID_TOKEN", "Link reset tidak valid atau sudah kedaluwarsa.");
  }
  const passwordError = validatePasswordStrength(newPassword, token.user.email);
  if (passwordError) throw new AccountLifecycleError("WEAK_PASSWORD", passwordError);
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.authToken.updateMany({
      where: {
        id: token.id,
        purpose: AuthTokenPurpose.PASSWORD_RESET,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) {
      throw new AccountLifecycleError("INVALID_TOKEN", "Link reset tidak valid atau sudah dipakai.");
    }
    const recovered = await tx.user.updateMany({
      where: {
        id: token.userId,
        status: { in: [UserStatus.ACTIVE, UserStatus.DELETION_PENDING] },
      },
      data: {
        passwordHash,
        emailVerifiedAt: now,
        status: UserStatus.ACTIVE,
        deletionRequestedAt: null,
      },
    });
    if (recovered.count !== 1) {
      throw new AccountLifecycleError("INVALID_TOKEN", "Akun tidak lagi dapat dipulihkan.");
    }
    await tx.authToken.updateMany({
      where: { userId: token.userId, purpose: AuthTokenPurpose.PASSWORD_RESET, usedAt: null },
      data: { usedAt: now },
    });
  });
}

export async function sendVerificationEmailForUser(userId: string, enforceLimit = false) {
  if (enforceLimit) {
    const limit = await consumeDurableRateLimit(userId, verificationRules);
    if (!limit.allowed) {
      throw new AccountLifecycleError("RATE_LIMITED", "Terlalu sering meminta email verifikasi.");
    }
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, emailVerifiedAt: true },
  });
  if (!user || user.emailVerifiedAt) {
    return {
      alreadyVerified: true,
      sent: false,
      configured: false,
      error: null,
    };
  }

  const token = await issueToken(user.id, AuthTokenPurpose.EMAIL_VERIFICATION, 24 * 60 * 60_000);
  const url = `${getPublicAppUrl()}/verify-email?token=${encodeURIComponent(token.value)}`;
  const delivery = await deliverIssuedTokenEmail(token, {
    to: user.email,
    subject: "Verifikasi email Aijou AI",
    idempotencyKey: `verify-email-${token.id}`,
    text: `Halo ${user.name}, verifikasi email dan tentukan password final Aijou AI lewat link ini (berlaku 24 jam):\n\n${url}`,
    html: emailTemplate({
      title: "Verifikasi email kamu",
      greeting: `Halo ${user.name},`,
      message: "Buktikan kepemilikan email dan tentukan password final untuk mengaktifkan akses workspace.",
      actionLabel: "Verifikasi dan buat password",
      actionUrl: url,
      footnote: "Link berlaku 24 jam dan hanya bisa dipakai sekali.",
    }),
  });
  return {
    alreadyVerified: false,
    sent: delivery.sent,
    configured: delivery.configured,
    error: delivery.error,
  };
}

export async function verifyEmailWithToken(tokenValue: string, newPassword: string) {
  const tokenHash = hashToken(tokenValue);
  const token = await prisma.authToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      purpose: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, status: true } },
    },
  });
  if (
    !token ||
    token.purpose !== AuthTokenPurpose.EMAIL_VERIFICATION ||
    token.usedAt ||
    token.expiresAt <= new Date() ||
    !isAccountRecoveryAllowed(token.user.status)
  ) {
    throw new AccountLifecycleError("INVALID_TOKEN", "Link verifikasi tidak valid atau sudah kedaluwarsa.");
  }
  const passwordError = validatePasswordStrength(newPassword, token.user.email);
  if (passwordError) throw new AccountLifecycleError("WEAK_PASSWORD", passwordError);
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.authToken.updateMany({
      where: {
        id: token.id,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new AccountLifecycleError("INVALID_TOKEN", "Link sudah dipakai.");
    const verified = await tx.user.updateMany({
      where: {
        id: token.userId,
        emailVerifiedAt: null,
        status: { in: [UserStatus.ACTIVE, UserStatus.DELETION_PENDING] },
      },
      data: { emailVerifiedAt: now, passwordHash },
    });
    if (verified.count !== 1) {
      throw new AccountLifecycleError("INVALID_TOKEN", "Email sudah diverifikasi atau akun tidak aktif.");
    }
    await tx.authToken.updateMany({
      where: {
        userId: token.userId,
        purpose: AuthTokenPurpose.EMAIL_VERIFICATION,
        usedAt: null,
      },
      data: { usedAt: now },
    });
  });
}

export async function requestAccountDeletion(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
      isPlatformAdmin: true,
      status: true,
      businesses: {
        select: {
          memberships: {
            where: { isActive: true, userId: { not: userId } },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AccountLifecycleError("INVALID_PASSWORD", "Password tidak cocok.");
  }
  if (user.isPlatformAdmin) {
    throw new AccountLifecycleError(
      "PLATFORM_ADMIN",
      "Lepaskan akses platform admin sebelum menjadwalkan penghapusan akun.",
    );
  }
  if (user.businesses.some((business) => business.memberships.length > 0)) {
    throw new AccountLifecycleError(
      "WORKSPACE_HAS_MEMBERS",
      "Pindahkan kepemilikan atau nonaktifkan seluruh anggota sebelum menghapus akun owner.",
    );
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new AccountLifecycleError("ACCOUNT_UNAVAILABLE", "Akun tidak dapat dijadwalkan untuk dihapus.");
  }
  const scheduled = await prisma.user.updateMany({
    where: { id: userId, status: UserStatus.ACTIVE },
    data: { status: UserStatus.DELETION_PENDING, deletionRequestedAt: new Date() },
  });
  if (scheduled.count !== 1) {
    throw new AccountLifecycleError("ACCOUNT_UNAVAILABLE", "Status akun berubah. Coba muat ulang halaman.");
  }
  return scheduled;
}

export async function cancelAccountDeletion(userId: string) {
  return prisma.user.updateMany({
    where: { id: userId, status: UserStatus.DELETION_PENDING },
    data: { status: UserStatus.ACTIVE, deletionRequestedAt: null },
  });
}

export async function pruneAuthTokens() {
  const now = new Date();
  const result = await prisma.authToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } }] },
  });
  return result.count;
}

export type PurgeDeletionPendingAccountsOptions = {
  limit?: number;
  deadlineAt?: number;
};

type PurgeTransactionBudget = {
  maxWaitMs: number;
  timeoutMs: number;
};

const inboundWebhookJobTypes = ["WHATSAPP_WEBHOOK", "TELEGRAM_WEBHOOK"];
const disabledWidgetOrigin = "https://purging.invalid";

export async function purgeDeletionPendingAccounts(
  options: PurgeDeletionPendingAccountsOptions = {},
) {
  const limit = Math.min(10, Math.max(1, Math.floor(options.limit ?? 1)));
  const deadlineAt = Number.isFinite(options.deadlineAt)
    ? (options.deadlineAt as number)
    : Date.now() + 20_000;
  if (Date.now() >= deadlineAt - 1_000) return 0;

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
  const candidates = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT account."id"
    FROM "users" AS account
    WHERE account."status" IN (
        'DELETION_PENDING'::"UserStatus",
        'PURGING'::"UserStatus"
      )
      AND account."deletionRequestedAt" < ${cutoff}
      AND account."isPlatformAdmin" = false
      AND NOT EXISTS (
        SELECT 1
        FROM "businesses" AS business
        INNER JOIN "workspace_memberships" AS membership
          ON membership."businessId" = business."id"
        WHERE business."userId" = account."id"
          AND membership."userId" <> account."id"
          AND membership."isActive" = true
    )
    ORDER BY
      CASE WHEN account."status" = 'PURGING'::"UserStatus" THEN 0 ELSE 1 END,
      account."deletionRequestedAt" ASC
    LIMIT ${limit}
  `;

  let deletedCount = 0;
  for (const candidate of candidates) {
    const prepareBudget = getPurgeTransactionBudget(deadlineAt, 2_000, 5_000);
    if (!prepareBudget) break;

    try {
      const prepared = await prepareAccountPurge(
        candidate.id,
        cutoff,
        prepareBudget,
      );
      if (!prepared) continue;

      // This read and every storage operation intentionally happen after the
      // PURGING marker/connector shutdown transaction has committed.
      const mediaSnapshot = await getAccountReceiptMediaSnapshot(candidate.id);
      const cleanupTimeoutMs = deadlineAt - Date.now() - 1_250;
      if (cleanupTimeoutMs < 250) {
        throw new Error("Account purge media cleanup reached its execution deadline.");
      }
      await cleanupPersistedReceiptMedia(mediaSnapshot, {
        abortSignal: AbortSignal.timeout(cleanupTimeoutMs),
      });

      const finalizeBudget = getPurgeTransactionBudget(deadlineAt, 100, 5_000);
      if (!finalizeBudget) {
        throw new Error("Account purge finalization reached its execution deadline.");
      }
      if (
        await finalizePreparedAccountPurge(
          candidate.id,
          cutoff,
          mediaSnapshot,
          finalizeBudget,
        )
      ) deletedCount += 1;
    } catch (error) {
      // Storage cleanup is fail-closed. PURGING is durable, so a later cron
      // retries the idempotent cleanup without reopening login or connectors.
      console.error("account_purge_retry_scheduled", {
        userId: candidate.id,
        reason: error instanceof Error ? error.message.slice(0, 300) : "unknown_error",
      });
    }
  }

  return deletedCount;
}

async function prepareAccountPurge(
  userId: string,
  cutoff: Date,
  budget: PurgeTransactionBudget,
) {
  return prisma.$transaction(async (tx) => {
    const lockedAccount = await tx.$queryRaw<Array<{ id: string; status: UserStatus }>>`
      SELECT account."id", account."status"
      FROM "users" AS account
      WHERE account."id" = ${userId}
        AND account."status" IN (
          'DELETION_PENDING'::"UserStatus",
          'PURGING'::"UserStatus"
        )
        AND account."deletionRequestedAt" < ${cutoff}
        AND account."isPlatformAdmin" = false
      FOR UPDATE
    `;
    if (lockedAccount.length !== 1) return false;

    // Lock owned workspaces and their existing memberships before touching
    // external media. Account cancellation, new membership FK checks, and
    // membership activation now have to wait until this transaction commits.
    const ownedBusinesses = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT business."id"
      FROM "businesses" AS business
      WHERE business."userId" = ${userId}
      FOR UPDATE
    `;
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT membership."id"
      FROM "workspace_memberships" AS membership
      INNER JOIN "businesses" AS business
        ON business."id" = membership."businessId"
      WHERE business."userId" = ${userId}
      FOR UPDATE OF membership
    `;

    const activeTeammate = await tx.workspaceMembership.findFirst({
      where: {
        business: { userId },
        userId: { not: userId },
        isActive: true,
      },
      select: { id: true },
    });
    if (activeTeammate) return false;

    const marked = await tx.user.updateMany({
      where: {
        id: userId,
        status: lockedAccount[0].status,
        deletionRequestedAt: { lt: cutoff },
        isPlatformAdmin: false,
      },
      data: { status: UserStatus.PURGING },
    });
    if (marked.count !== 1) return false;

    const businessIds = ownedBusinesses.map((business) => business.id);
    await disableInboundConnectors(tx, businessIds);
    await tx.authToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return true;
  }, {
    maxWait: budget.maxWaitMs,
    timeout: budget.timeoutMs,
  });
}

async function getAccountReceiptMediaSnapshot(userId: string) {
  return prisma.mediaFile.findMany({
    where: { business: { userId } },
    select: {
      id: true,
      businessId: true,
      storagePath: true,
      fileUrl: true,
    },
  });
}

async function finalizePreparedAccountPurge(
  userId: string,
  cutoff: Date,
  cleanedMedia: readonly PersistedReceiptMediaSnapshot[],
  budget: PurgeTransactionBudget,
) {
  return prisma.$transaction(async (tx) => {
    const lockedAccount = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT account."id"
      FROM "users" AS account
      WHERE account."id" = ${userId}
        AND account."status" = 'PURGING'::"UserStatus"
        AND account."deletionRequestedAt" < ${cutoff}
        AND account."isPlatformAdmin" = false
      FOR UPDATE
    `;
    if (lockedAccount.length !== 1) return false;

    const ownedBusinesses = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT business."id"
      FROM "businesses" AS business
      WHERE business."userId" = ${userId}
      FOR UPDATE
    `;
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT membership."id"
      FROM "workspace_memberships" AS membership
      INNER JOIN "businesses" AS business
        ON business."id" = membership."businessId"
      WHERE business."userId" = ${userId}
      FOR UPDATE OF membership
    `;

    const activeTeammate = await tx.workspaceMembership.findFirst({
      where: {
        business: { userId },
        userId: { not: userId },
        isActive: true,
      },
      select: { id: true },
    });
    if (activeTeammate) return false;

    const businessIds = ownedBusinesses.map((business) => business.id);
    await disableInboundConnectors(tx, businessIds);

    // A worker that claimed a webhook before connector shutdown may still be
    // downloading media. Let it settle and retry on the next cron rather than
    // risk orphaning an external object after the database cascade.
    const inFlightWebhook = await tx.backgroundJob.findFirst({
      where: {
        businessId: { in: businessIds },
        type: { in: inboundWebhookJobTypes },
        status: BackgroundJobStatus.PROCESSING,
      },
      select: { id: true },
    });
    if (inFlightWebhook) return false;

    const currentMedia = await tx.mediaFile.findMany({
      where: { businessId: { in: businessIds } },
      select: {
        id: true,
        businessId: true,
        storagePath: true,
        fileUrl: true,
      },
    });
    if (!receiptMediaSnapshotsMatch(cleanedMedia, currentMedia)) return false;

    // Keep the membership condition in the DELETE itself as the final guard,
    // even though the rows above are locked. This also protects future callers
    // if the locking strategy changes.
    const deleted = await tx.$queryRaw<Array<{ id: string }>>`
      DELETE FROM "users" AS account
      WHERE account."id" = ${userId}
        AND account."status" = 'PURGING'::"UserStatus"
        AND account."deletionRequestedAt" < ${cutoff}
        AND account."isPlatformAdmin" = false
        AND NOT EXISTS (
          SELECT 1
          FROM "businesses" AS business
          INNER JOIN "workspace_memberships" AS membership
            ON membership."businessId" = business."id"
          WHERE business."userId" = account."id"
            AND membership."userId" <> account."id"
            AND membership."isActive" = true
        )
      RETURNING account."id"
    `;
    return deleted.length === 1;
  }, {
    maxWait: budget.maxWaitMs,
    timeout: budget.timeoutMs,
  });
}

async function disableInboundConnectors(
  tx: Prisma.TransactionClient,
  businessIds: string[],
) {
  for (const businessId of businessIds) {
    await tx.business.update({
      where: { id: businessId },
      data: {
        widgetAllowedOrigin: disabledWidgetOrigin,
        widgetKey: `purging-${businessId}-${randomBytes(8).toString("hex")}`,
      },
    });
  }

  await tx.agentSettings.updateMany({
    where: { businessId: { in: businessIds } },
    data: { isActive: false },
  });
  await tx.whatsAppSettings.updateMany({
    where: { businessId: { in: businessIds } },
    data: { isActive: false },
  });
  await tx.telegramSettings.updateMany({
    where: { businessId: { in: businessIds } },
    data: { isActive: false },
  });
  await tx.paymentSettings.updateMany({
    where: { businessId: { in: businessIds } },
    data: {
      isActive: false,
      secretKey: null,
      webhookToken: null,
    },
  });
  await tx.backgroundJob.updateMany({
    where: {
      businessId: { in: businessIds },
      type: { in: inboundWebhookJobTypes },
      status: BackgroundJobStatus.PENDING,
    },
    data: {
      payload: {},
      status: BackgroundJobStatus.FAILED,
      lockedAt: null,
      lastError: "account_purging",
    },
  });

}

function getPurgeTransactionBudget(
  deadlineAt: number,
  reserveAfterMs: number,
  maxTimeoutMs: number,
): PurgeTransactionBudget | null {
  const remainingMs = deadlineAt - Date.now() - reserveAfterMs;
  if (remainingMs < 1_250) return null;
  const maxWaitMs = Math.min(1_500, Math.max(250, Math.floor(remainingMs / 5)));
  const timeoutMs = Math.min(maxTimeoutMs, remainingMs - maxWaitMs);
  return timeoutMs >= 1_000 ? { maxWaitMs, timeoutMs } : null;
}

function isAccountRecoveryAllowed(status: UserStatus) {
  return status === UserStatus.ACTIVE || status === UserStatus.DELETION_PENDING;
}

type IssuedAuthToken = {
  id: string;
  userId: string;
  purpose: AuthTokenPurpose;
  value: string;
  previousTokenIds: string[];
};

async function issueToken(
  userId: string,
  purpose: AuthTokenPurpose,
  ttlMs: number,
): Promise<IssuedAuthToken> {
  const value = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(value);
  const issued = await prisma.$transaction(async (tx) => {
    const previous = await tx.authToken.findMany({
      where: { userId, purpose, usedAt: null },
      select: { id: true },
    });
    const created = await tx.authToken.create({
      data: { userId, purpose, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
      select: { id: true },
    });
    return { id: created.id, previousTokenIds: previous.map((token) => token.id) };
  });
  return { id: issued.id, userId, purpose, value, previousTokenIds: issued.previousTokenIds };
}

async function deliverIssuedTokenEmail(
  token: IssuedAuthToken,
  message: Parameters<typeof sendTransactionalEmail>[0],
) {
  let delivery: Awaited<ReturnType<typeof sendTransactionalEmail>>;
  try {
    delivery = await sendTransactionalEmail(message);
  } catch (error) {
    await settleIssuedTokenDelivery(token, false);
    throw error;
  }

  await settleIssuedTokenDelivery(token, delivery.sent);
  return delivery;
}

async function settleIssuedTokenDelivery(token: IssuedAuthToken, sent: boolean) {
  try {
    if (!sent) {
      await prisma.authToken.deleteMany({
        where: {
          id: token.id,
          userId: token.userId,
          purpose: token.purpose,
          usedAt: null,
        },
      });
      return;
    }

    if (token.previousTokenIds.length) {
      await prisma.authToken.updateMany({
        where: {
          id: { in: token.previousTokenIds },
          userId: token.userId,
          purpose: token.purpose,
          usedAt: null,
        },
        data: { usedAt: new Date() },
      });
    }
  } catch (error) {
    // Delivery state must never leak through recovery responses. A failed
    // cleanup leaves the older link valid, which is safer than revoking a link
    // when its replacement may not have reached the mailbox.
    console.error("auth_token_delivery_settlement_failed", {
      tokenId: token.id,
      purpose: token.purpose,
      sent,
      error,
    });
  }
}

function hashToken(value: string) {
  return createHash("sha256").update(value.trim()).digest("hex");
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function emailTemplate(params: {
  title: string;
  greeting: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
  footnote: string;
}) {
  const title = escapeEmailHtml(params.title);
  const greeting = escapeEmailHtml(params.greeting);
  const message = escapeEmailHtml(params.message);
  const label = escapeEmailHtml(params.actionLabel);
  const url = escapeEmailHtml(params.actionUrl);
  const footnote = escapeEmailHtml(params.footnote);
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;color:#171a17;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fff;padding:32px;border-radius:18px"><p style="font-size:13px;color:#5f746a">AIJOU AI</p><h1 style="font-size:28px">${title}</h1><p>${greeting}</p><p style="line-height:1.6">${message}</p><p style="margin:28px 0"><a href="${url}" style="background:#183f35;color:#fff;padding:13px 18px;border-radius:10px;text-decoration:none">${label}</a></p><p style="font-size:13px;color:#66706b">${footnote}</p></div></body></html>`;
}
