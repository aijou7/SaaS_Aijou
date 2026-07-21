import { randomBytes, randomUUID } from "node:crypto";
import {
  Prisma,
  UserRole,
  UserStatus,
  WorkspaceRole,
} from "@/generated/prisma-beta/client";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  canManageWorkspaceRole,
  hashTeamInviteToken,
  isTeamInviteToken,
  normalizeTeamInviteEmail,
  parseWorkspaceRole,
  strongerWorkspaceRole,
  type WorkspaceRoleValue,
} from "@/lib/team-invites";
import {
  escapeEmailHtml,
  getPublicAppUrl,
  sendTransactionalEmail,
} from "@/server/email";
import { requireWorkspaceAccess } from "@/server/workspace-access";

const teamManagerRoles = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] as const;
const inviteLifetimeMs = 7 * 24 * 60 * 60_000;
const inviteRateRules = [
  { scope: "team-invite:actor:15m", max: 10, windowMs: 15 * 60_000 },
  { scope: "team-invite:actor:24h", max: 50, windowMs: 24 * 60 * 60_000 },
] as const;

export class TeamAccessError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TeamAccessError";
  }
}

export function getSafeTeamAccessError(error: unknown) {
  return error instanceof TeamAccessError
    ? error.message
    : "Tindakan tim belum berhasil. Coba lagi beberapa saat.";
}

export async function getTeamManagementPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, teamManagerRoles);
  const business = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: {
      id: true,
      userId: true,
      businessName: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          lastSeenAt: true,
          createdAt: true,
        },
      },
      memberships: {
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          role: true,
          isActive: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              status: true,
              lastSeenAt: true,
              createdAt: true,
            },
          },
        },
      },
      teamInvites: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          createdAt: true,
          createdBy: { select: { name: true } },
          acceptedBy: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!business) throw new TeamAccessError("WORKSPACE_NOT_FOUND", "Workspace tidak ditemukan.");

  const members = business.memberships.map((membership) => ({
    ...membership,
    role: membership.user.id === business.userId ? WorkspaceRole.OWNER : membership.role,
    isActive: membership.user.id === business.userId ? true : membership.isActive,
  }));
  if (!members.some((membership) => membership.user.id === business.userId)) {
    members.unshift({
      id: `owner:${business.id}`,
      role: WorkspaceRole.OWNER,
      isActive: true,
      createdAt: business.user.createdAt,
      user: business.user,
    });
  }

  return {
    access,
    business: { id: business.id, businessName: business.businessName },
    members,
    invites: business.teamInvites,
  };
}

export async function createTeamInvite(
  actorUserId: string,
  input: { email: string; role: string },
) {
  const access = await requireWorkspaceAccess(actorUserId, teamManagerRoles);
  const email = normalizeTeamInviteEmail(input.email);
  const roleValue = parseWorkspaceRole(input.role);
  if (!email) throw new TeamAccessError("INVALID_EMAIL", "Email anggota tidak valid.");
  if (!roleValue) throw new TeamAccessError("INVALID_ROLE", "Role tim tidak valid.");
  if (!canManageWorkspaceRole(access.role as WorkspaceRoleValue, roleValue)) {
    throw new TeamAccessError("FORBIDDEN_ROLE", "Role tersebut hanya dapat diberikan oleh owner.");
  }

  const limit = await consumeDurableRateLimit(actorUserId, inviteRateRules);
  if (!limit.allowed) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    throw new TeamAccessError(
      "RATE_LIMITED",
      `Terlalu banyak undangan. Coba lagi sekitar ${minutes} menit.`,
    );
  }

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashTeamInviteToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + inviteLifetimeMs);
  const role = roleValue as WorkspaceRole;

  const invite = await prisma.$transaction(async (tx) => {
    const actorRole = await getActorRoleInTransaction(
      tx,
      access.businessId,
      actorUserId,
    );
    if (!actorRole || !canManageWorkspaceRole(actorRole, roleValue)) {
      throw new TeamAccessError("FORBIDDEN", "Kamu tidak memiliki izin membuat undangan ini.");
    }

    const activeMember = await tx.workspaceMembership.findFirst({
      where: {
        businessId: access.businessId,
        isActive: true,
        user: { email },
      },
      select: { id: true },
    });
    if (activeMember) {
      throw new TeamAccessError("ALREADY_MEMBER", "Email tersebut sudah menjadi anggota aktif.");
    }

    await tx.teamInvite.updateMany({
      where: {
        businessId: access.businessId,
        email,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });

    return tx.teamInvite.create({
      data: {
        businessId: access.businessId,
        email,
        role,
        tokenHash,
        createdById: actorUserId,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        business: { select: { businessName: true } },
        createdBy: { select: { name: true } },
      },
    });
  });

  const inviteUrl = new URL("/team/accept", getPublicAppUrl());
  inviteUrl.searchParams.set("token", rawToken);
  const safeBusinessName = escapeEmailHtml(invite.business.businessName);
  const safeInviterName = escapeEmailHtml(invite.createdBy.name);
  const safeRole = escapeEmailHtml(formatWorkspaceRole(invite.role));
  const safeUrl = escapeEmailHtml(inviteUrl.toString());
  const delivery = await sendTransactionalEmail({
    to: invite.email,
    subject: `Undangan bergabung ke ${invite.business.businessName} di Aijou`,
    idempotencyKey: `team-invite-${invite.id}`,
    text: `${invite.createdBy.name} mengundang kamu bergabung ke ${invite.business.businessName} sebagai ${formatWorkspaceRole(invite.role)}. Buka link berikut dalam 7 hari; link hanya bisa dipakai sekali:\n\n${inviteUrl.toString()}`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f1ea;color:#171a17;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fff;padding:32px;border-radius:18px"><p style="font-size:13px;color:#5f746a">AIJOU AI</p><h1 style="font-size:28px">Bergabung ke ${safeBusinessName}</h1><p>${safeInviterName} mengundang kamu sebagai <strong>${safeRole}</strong>.</p><p style="margin:28px 0"><a href="${safeUrl}" style="background:#183f35;color:#fff;padding:13px 18px;border-radius:10px;text-decoration:none">Terima undangan</a></p><p style="font-size:13px;color:#66706b">Link berlaku 7 hari dan hanya bisa dipakai sekali. Abaikan email ini jika kamu tidak mengenal pengirimnya.</p></div></body></html>`,
  });

  return {
    invite,
    delivery,
    inviteUrl: inviteUrl.toString(),
  };
}

export async function revokeTeamInvite(actorUserId: string, inviteId: string) {
  const access = await requireWorkspaceAccess(actorUserId, teamManagerRoles);
  if (!inviteId || inviteId.length > 160) {
    throw new TeamAccessError("INVALID_INVITE", "Undangan tidak valid.");
  }

  await prisma.$transaction(async (tx) => {
    const [actorRole, invite] = await Promise.all([
      getActorRoleInTransaction(tx, access.businessId, actorUserId),
      tx.teamInvite.findFirst({
        where: { id: inviteId, businessId: access.businessId },
        select: { id: true, role: true, acceptedAt: true, revokedAt: true },
      }),
    ]);
    if (!actorRole || !invite) {
      throw new TeamAccessError("INVITE_NOT_FOUND", "Undangan tidak ditemukan.");
    }
    if (!canManageWorkspaceRole(actorRole, invite.role as WorkspaceRoleValue)) {
      throw new TeamAccessError("FORBIDDEN", "Kamu tidak memiliki izin mencabut undangan ini.");
    }
    if (invite.acceptedAt || invite.revokedAt) {
      throw new TeamAccessError("INVITE_INACTIVE", "Undangan sudah tidak aktif.");
    }

    const revoked = await tx.teamInvite.updateMany({
      where: { id: invite.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) {
      throw new TeamAccessError("INVITE_INACTIVE", "Undangan sudah tidak aktif.");
    }
  });
}

export async function inspectTeamInvite(rawToken: string) {
  const invite = await findUsableTeamInvite(rawToken);
  if (!invite) return null;
  const existingUser = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });

  return {
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    businessName: invite.business.businessName,
    inviterName: invite.createdBy.name,
    existingAccount: Boolean(existingUser),
  };
}

export async function acceptTeamInvite(
  input: { token: string; name?: string; password?: string },
  actingUserId?: string,
) {
  const invite = await findUsableTeamInvite(input.token);
  if (!invite) {
    throw new TeamAccessError(
      "INVALID_INVITE",
      "Undangan tidak valid, sudah dipakai, dicabut, atau kedaluwarsa.",
    );
  }

  const preflightUser = actingUserId
    ? await prisma.user.findUnique({
        where: { id: actingUserId },
        select: { id: true, email: true, status: true },
      })
    : await prisma.user.findUnique({
        where: { email: invite.email },
        select: { id: true, email: true, status: true },
      });

  if (actingUserId && preflightUser?.email.toLowerCase() !== invite.email) {
    throw new TeamAccessError(
      "EMAIL_MISMATCH",
      "Undangan ini ditujukan ke email lain. Keluar lalu buka link memakai akun yang sesuai.",
    );
  }
  if (preflightUser && preflightUser.status !== UserStatus.ACTIVE) {
    throw new TeamAccessError("ACCOUNT_INACTIVE", "Akun tujuan sedang tidak aktif.");
  }

  let normalizedName = "";
  let newPasswordHash: string | null = null;
  if (!preflightUser) {
    normalizedName = normalizeMemberName(input.name ?? "");
    const password = input.password ?? "";
    const passwordError = validatePasswordStrength(password, invite.email);
    if (passwordError) throw new TeamAccessError("WEAK_PASSWORD", passwordError);
    newPasswordHash = await hashPassword(password);
  }

  const now = new Date();
  const candidateUserId = randomUUID();
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.teamInvite.updateMany({
      where: {
        id: invite.id,
        tokenHash: invite.tokenHash,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) {
      throw new TeamAccessError("INVALID_INVITE", "Undangan sudah dipakai atau tidak aktif.");
    }

    const user = actingUserId
      ? await tx.user.findUnique({
          where: { id: actingUserId },
          select: { id: true, email: true, status: true, passwordHash: true },
        })
      : preflightUser
        ? await tx.user.findUnique({
            where: { email: invite.email },
            select: { id: true, email: true, status: true, passwordHash: true },
          })
        : await tx.user.upsert({
            where: { email: invite.email },
            update: { emailVerifiedAt: now },
            create: {
              id: candidateUserId,
              name: normalizedName,
              email: invite.email,
              passwordHash: newPasswordHash!,
              role: UserRole.ADMIN,
              status: UserStatus.ACTIVE,
              emailVerifiedAt: now,
              signupSource: "TEAM_INVITE",
            },
            select: { id: true, email: true, status: true, passwordHash: true },
          });

    if (!user || user.email.toLowerCase() !== invite.email || user.status !== UserStatus.ACTIVE) {
      throw new TeamAccessError("ACCOUNT_INACTIVE", "Akun tujuan tidak tersedia.");
    }

    await tx.user.updateMany({
      where: { id: user.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });

    const existingMembership = await tx.workspaceMembership.findUnique({
      where: {
        businessId_userId: { businessId: invite.businessId, userId: user.id },
      },
      select: { role: true },
    });
    const resolvedRole = existingMembership
      ? strongerWorkspaceRole(
          existingMembership.role as WorkspaceRoleValue,
          invite.role as WorkspaceRoleValue,
        )
      : (invite.role as WorkspaceRoleValue);

    await tx.workspaceMembership.upsert({
      where: {
        businessId_userId: { businessId: invite.businessId, userId: user.id },
      },
      update: { role: resolvedRole as WorkspaceRole, isActive: true },
      create: {
        businessId: invite.businessId,
        userId: user.id,
        role: resolvedRole as WorkspaceRole,
        isActive: true,
      },
    });
    await tx.teamInvite.update({
      where: { id: invite.id },
      data: { acceptedById: user.id },
    });

    const createdUser = user.id === candidateUserId;
    return {
      userId: user.id,
      createdUser,
      passwordHash: createdUser ? user.passwordHash : null,
      role: resolvedRole,
      businessId: invite.businessId,
    };
  });
}

async function findUsableTeamInvite(rawToken: string) {
  const token = rawToken.trim();
  if (!isTeamInviteToken(token)) return null;
  return prisma.teamInvite.findUnique({
    where: { tokenHash: hashTeamInviteToken(token) },
    select: {
      id: true,
      tokenHash: true,
      businessId: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      business: { select: { businessName: true } },
      createdBy: { select: { name: true } },
    },
  }).then((invite) =>
    invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date()
      ? invite
      : null,
  );
}

async function getActorRoleInTransaction(
  tx: Prisma.TransactionClient,
  businessId: string,
  userId: string,
): Promise<WorkspaceRoleValue | null> {
  const business = await tx.business.findUnique({
    where: { id: businessId },
    select: { userId: true },
  });
  if (!business) return null;
  if (business.userId === userId) return "OWNER";

  const membership = await tx.workspaceMembership.findUnique({
    where: { businessId_userId: { businessId, userId } },
    select: { role: true, isActive: true },
  });
  return membership?.isActive ? (membership.role as WorkspaceRoleValue) : null;
}

function normalizeMemberName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 100 || /\p{C}/u.test(name)) {
    throw new TeamAccessError("INVALID_NAME", "Nama lengkap harus berisi 2–100 karakter.");
  }
  return name;
}

export function formatWorkspaceRole(role: WorkspaceRole | WorkspaceRoleValue) {
  const labels: Record<WorkspaceRoleValue, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    AGENT: "Agent",
    VIEWER: "Viewer",
  };
  return labels[role as WorkspaceRoleValue];
}
