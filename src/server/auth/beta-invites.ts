import { createHash, randomBytes } from "node:crypto";
import { UserRole, WorkspaceRole } from "@/generated/prisma-beta/client";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { newWorkspaceAgentDefaults } from "@/server/agent/defaults";

export class BetaInviteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetaInviteError";
  }
}

export function getSafeBetaInviteError(error: unknown, fallback: string) {
  return error instanceof BetaInviteError ? error.message : fallback;
}

export async function getBetaInvitesPage(userId: string) {
  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });
  if (!admin?.isPlatformAdmin) {
    throw new BetaInviteError("Hanya platform admin yang dapat membuat beta invite.");
  }

  return prisma.betaInvite.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      email: true,
      businessName: true,
      expiresAt: true,
      usedAt: true,
      usedById: true,
      createdAt: true,
    },
  });
}

export async function createBetaInvite(
  userId: string,
  input: { email?: string; businessName?: string; expiresInDays?: number },
) {
  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });
  if (!admin?.isPlatformAdmin) {
    throw new BetaInviteError("Hanya platform admin yang dapat membuat beta invite.");
  }

  const email = cleanEmail(input.email);
  const businessName = clean(input.businessName, 120);
  const requestedDays = Number.isFinite(input.expiresInDays)
    ? Math.floor(input.expiresInDays as number)
    : 7;
  const days = Math.min(30, Math.max(1, requestedDays));
  const rawToken = randomBytes(32).toString("base64url");
  const invite = await prisma.betaInvite.create({
    data: {
      tokenHash: hashToken(rawToken),
      email,
      businessName,
      createdById: userId,
      expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1_000),
    },
  });

  return { invite, rawToken };
}

export async function inspectBetaInvite(rawToken: string) {
  const token = rawToken.trim();
  if (token.length < 32 || token.length > 128) return null;
  const invite = await prisma.betaInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { email: true, businessName: true, expiresAt: true, usedAt: true },
  });
  if (!invite || invite.usedAt || invite.expiresAt <= new Date()) return null;
  return invite;
}

export async function acceptBetaInvite(input: {
  token: string;
  name: string;
  email: string;
  phoneNumber?: string;
  businessName: string;
  password: string;
}) {
  const token = input.token.trim();
  if (token.length < 32 || token.length > 128) {
    throw new BetaInviteError("Invite tidak valid, sudah dipakai, atau kedaluwarsa.");
  }

  const name = clean(input.name, 100);
  const email = cleanEmail(input.email);
  const phoneNumber = normalizePhone(input.phoneNumber);
  const businessName = clean(input.businessName, 120);

  if (!name || !email || !phoneNumber || !businessName) {
    throw new BetaInviteError(
      "Nama, email, nomor WhatsApp owner, dan nama bisnis wajib diisi.",
    );
  }
  const passwordError = validatePasswordStrength(input.password, email);
  if (passwordError) throw new BetaInviteError(passwordError);

  // Reject invalid tokens before running the deliberately expensive password
  // hash. The invite is claimed atomically again inside the transaction below.
  const tokenHash = hashToken(token);
  const preflightInvite = await prisma.betaInvite.findUnique({
    where: { tokenHash },
    select: { email: true, expiresAt: true, usedAt: true },
  });
  if (
    !preflightInvite ||
    preflightInvite.usedAt ||
    preflightInvite.expiresAt <= new Date()
  ) {
    throw new BetaInviteError("Invite tidak valid, sudah dipakai, atau kedaluwarsa.");
  }
  if (preflightInvite.email?.toLowerCase() !== (preflightInvite.email ? email : undefined)) {
    throw new BetaInviteError("Email harus sama dengan email pada invite.");
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.$transaction(async (tx) => {
      // updateMany makes the single-use claim race-safe. If another request has
      // already claimed the invite, PostgreSQL re-checks the predicate after
      // waiting for that row and count will be zero.
      const claimedAt = new Date();
      const claimed = await tx.betaInvite.updateMany({
        where: {
          tokenHash,
          usedAt: null,
          expiresAt: { gt: claimedAt },
        },
        data: { usedAt: claimedAt },
      });
      if (claimed.count !== 1) {
        throw new BetaInviteError(
          "Invite tidak valid, sudah dipakai, atau kedaluwarsa.",
        );
      }

      const user = await tx.user.create({
        data: {
          name,
          email,
          phoneNumber,
          passwordHash,
          role: UserRole.OWNER,
          signupSource: "BETA_INVITE",
          emailVerifiedAt: claimedAt,
        },
      });
      const business = await tx.business.create({
        data: {
          id: user.id + ":default",
          userId: user.id,
          businessName,
          businessType: "Belum diisi",
        },
      });
      await tx.agentSettings.create({
        data: {
          businessId: business.id,
          ...newWorkspaceAgentDefaults(businessName),
        },
      });
      await tx.workspaceMembership.create({
        data: { businessId: business.id, userId: user.id, role: WorkspaceRole.OWNER },
      });
      await tx.activationEvent.create({
        data: { businessId: business.id, type: "SIGNUP", metadata: { source: "BETA_INVITE" } },
      });
      await tx.betaInvite.update({
        where: { tokenHash },
        data: { usedById: user.id },
      });

      return { userId: user.id, email: user.email, passwordHash: user.passwordHash };
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new BetaInviteError("Email sudah terdaftar. Silakan login.");
    }
    throw error;
  }
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function clean(value: string | null | undefined, max: number) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() || "";
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BetaInviteError("Email tidak valid.");
  }
  return email;
}

function normalizePhone(value: string | null | undefined) {
  const phone = value?.replace(/[^\d+]/g, "") || "";
  if (!phone) return null;
  const normalized = phone.startsWith("+") ? phone.slice(1) : phone;
  if (!/^\d{8,18}$/.test(normalized)) {
    throw new BetaInviteError("Nomor WhatsApp owner tidak valid.");
  }
  return normalized;
}

function isUniqueEmailError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
    return false;
  }

  const target = "meta" in error ? JSON.stringify(error.meta) : "";
  return /email/i.test(target);
}
