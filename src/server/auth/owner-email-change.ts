import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ActorType, WorkspaceRole } from "@/generated/prisma-beta/client";
import { consumeDurableRateLimit } from "@/lib/durable-rate-limit";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { escapeEmailHtml, sendTransactionalEmail } from "@/server/email";
import { requireWorkspaceAccess } from "@/server/workspace-access";

const requestLifetimeMs = 30 * 60_000;
const requestRateRules = [
  { scope: "owner-email-change:1h", max: 3, windowMs: 60 * 60_000 },
  { scope: "owner-email-change:24h", max: 6, windowMs: 24 * 60 * 60_000 },
] as const;
const confirmationRateRules = [
  { scope: "owner-email-change-confirm:15m", max: 10, windowMs: 15 * 60_000 },
] as const;

export class OwnerEmailChangeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "OwnerEmailChangeError";
  }
}

export function getSafeOwnerEmailChangeError(error: unknown) {
  return error instanceof OwnerEmailChangeError
    ? error.message
    : "Pergantian email belum berhasil. Coba lagi beberapa saat.";
}

export async function requestOwnerEmailChange(
  userId: string,
  input: { newEmail: string; password: string },
) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER]);
  if (access.ownerId !== userId) {
    throw new OwnerEmailChangeError("OWNER_ONLY", "Hanya owner workspace yang dapat mengganti email owner.");
  }

  const limit = await consumeDurableRateLimit(userId, requestRateRules);
  if (!limit.allowed) {
    throw new OwnerEmailChangeError(
      "RATE_LIMITED",
      `Terlalu banyak permintaan. Coba lagi sekitar ${Math.ceil(limit.retryAfterSeconds / 60)} menit.`,
    );
  }

  const newEmail = normalizeEmail(input.newEmail);
  if (!newEmail) throw new OwnerEmailChangeError("INVALID_EMAIL", "Alamat email baru tidak valid.");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new OwnerEmailChangeError("INVALID_PASSWORD", "Password saat ini tidak cocok.");
  }
  if (newEmail === user.email.toLowerCase()) {
    throw new OwnerEmailChangeError("EMAIL_UNCHANGED", "Email baru harus berbeda dari email saat ini.");
  }

  const occupied = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (occupied) {
    throw new OwnerEmailChangeError(
      "EMAIL_IN_USE",
      "Email itu sudah menjadi akun Aijou. Jangan gabungkan akun; undang email tersebut sebagai Admin, Agent, atau Viewer.",
    );
  }

  const id = randomBytes(18).toString("base64url");
  const currentCode = createCode();
  const newCode = createCode();
  const now = new Date();
  await prisma.$transaction([
    prisma.ownerEmailChangeRequest.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.ownerEmailChangeRequest.create({
      data: {
        id,
        userId,
        businessId: access.businessId,
        currentEmail: user.email.toLowerCase(),
        newEmail,
        currentCodeHash: hashCode(id, "current", currentCode),
        newCodeHash: hashCode(id, "new", newCode),
        expiresAt: new Date(now.getTime() + requestLifetimeMs),
      },
    }),
  ]);

  const [currentDelivery, newDelivery] = await Promise.all([
    sendOwnerEmailCode({
      to: user.email,
      code: currentCode,
      businessName: access.businessName,
      kind: "current",
      requestId: id,
    }),
    sendOwnerEmailCode({
      to: newEmail,
      code: newCode,
      businessName: access.businessName,
      kind: "new",
      requestId: id,
    }),
  ]);

  if (!currentDelivery.sent || !newDelivery.sent) {
    await prisma.ownerEmailChangeRequest.deleteMany({ where: { id, userId } });
    throw new OwnerEmailChangeError(
      "DELIVERY_FAILED",
      "Dua email verifikasi belum berhasil dikirim. Periksa layanan email lalu coba lagi.",
    );
  }

  return { id, newEmail, expiresAt: new Date(now.getTime() + requestLifetimeMs) };
}

export async function confirmOwnerEmailChange(
  userId: string,
  input: { requestId: string; currentCode: string; newCode: string; password: string },
) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER]);
  if (access.ownerId !== userId) {
    throw new OwnerEmailChangeError("OWNER_ONLY", "Hanya owner workspace yang dapat mengganti email owner.");
  }

  const limit = await consumeDurableRateLimit(input.requestId || userId, confirmationRateRules);
  if (!limit.allowed) {
    throw new OwnerEmailChangeError("RATE_LIMITED", "Terlalu banyak percobaan kode. Buat permintaan baru nanti.");
  }

  const request = await prisma.ownerEmailChangeRequest.findFirst({
    where: {
      id: input.requestId,
      userId,
      businessId: access.businessId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: 10 },
    },
    select: {
      id: true,
      currentEmail: true,
      newEmail: true,
      currentCodeHash: true,
      newCodeHash: true,
    },
  });
  if (!request) {
    throw new OwnerEmailChangeError("INVALID_REQUEST", "Permintaan tidak tersedia atau sudah kedaluwarsa.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  const passwordMatches = Boolean(user && await verifyPassword(input.password, user.passwordHash));
  const codesMatch =
    codeMatches(request.currentCodeHash, request.id, "current", input.currentCode) &&
    codeMatches(request.newCodeHash, request.id, "new", input.newCode);

  if (!user || user.email.toLowerCase() !== request.currentEmail || !passwordMatches || !codesMatch) {
    await prisma.ownerEmailChangeRequest.updateMany({
      where: { id: request.id, consumedAt: null },
      data: { attempts: { increment: 1 } },
    });
    throw new OwnerEmailChangeError(
      "INVALID_CONFIRMATION",
      "Password atau salah satu kode OTP tidak cocok.",
    );
  }

  const occupied = await prisma.user.findUnique({
    where: { email: request.newEmail },
    select: { id: true },
  });
  if (occupied && occupied.id !== userId) {
    throw new OwnerEmailChangeError("EMAIL_IN_USE", "Email baru sudah digunakan akun lain.");
  }

  const rotatedPasswordHash = await hashPassword(input.password);
  const now = new Date();
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: userId, email: request.currentEmail, passwordHash: user.passwordHash },
      data: {
        email: request.newEmail,
        emailVerifiedAt: now,
        passwordHash: rotatedPasswordHash,
      },
    });
    if (updated.count !== 1) return false;

    await tx.ownerEmailChangeRequest.update({
      where: { id: request.id },
      data: { consumedAt: now },
    });
    await tx.authToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        businessId: access.businessId,
        actorType: ActorType.USER,
        actorId: userId,
        entityType: "owner_account",
        entityId: userId,
        action: "owner_email_changed",
        beforeJson: { email: request.currentEmail },
        afterJson: { email: request.newEmail, sessionsRevoked: true },
      },
    });
    return true;
  });

  if (!changed) {
    throw new OwnerEmailChangeError("CONFLICT", "Akun berubah di sesi lain. Login ulang lalu coba lagi.");
  }

  await Promise.allSettled([
    sendChangeCompletedEmail(request.currentEmail, request.newEmail, access.businessName, "old"),
    sendChangeCompletedEmail(request.newEmail, request.newEmail, access.businessName, "new"),
  ]);
}

function createCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function hashCode(requestId: string, kind: "current" | "new", code: string) {
  return createHmac("sha256", getOtpSecret())
    .update(`${requestId}\0${kind}\0${code.trim()}`)
    .digest("hex");
}

function codeMatches(
  expected: string,
  requestId: string,
  kind: "current" | "new",
  code: string,
) {
  if (!/^\d{6}$/.test(code)) return false;
  const actualBuffer = Buffer.from(hashCode(requestId, kind, code));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function getOtpSecret() {
  const secret = process.env.AUTH_OTP_SECRET?.trim() || process.env.AUTH_SECRET?.trim();
  if (secret && (process.env.NODE_ENV !== "production" || Buffer.byteLength(secret) >= 32)) {
    return secret;
  }
  if (process.env.NODE_ENV !== "production") return "dev-only-owner-email-change-secret";
  throw new Error("AUTH_OTP_SECRET or a strong AUTH_SECRET is required.");
}

function sendOwnerEmailCode(params: {
  to: string;
  code: string;
  businessName: string;
  kind: "current" | "new";
  requestId: string;
}) {
  const destination = params.kind === "current" ? "email lama" : "email baru";
  const safeBusiness = escapeEmailHtml(params.businessName);
  return sendTransactionalEmail({
    to: params.to,
    subject: `Kode konfirmasi email owner ${params.businessName}`,
    text: `Kode untuk ${destination}: ${params.code}. Berlaku 30 menit. Jangan berikan kode ini kepada siapa pun.`,
    html: `<p>Permintaan pergantian email owner untuk <strong>${safeBusiness}</strong>.</p><p>Kode ${destination}: <strong style="font-size:24px;letter-spacing:4px">${params.code}</strong></p><p>Kode berlaku 30 menit. Abaikan email ini jika kamu tidak meminta perubahan.</p>`,
    idempotencyKey: `owner-email-${params.requestId}-${params.kind}`,
  });
}

function sendChangeCompletedEmail(
  to: string,
  newEmail: string,
  businessName: string,
  destination: "old" | "new",
) {
  return sendTransactionalEmail({
    to,
    subject: `Email owner ${businessName} berhasil diganti`,
    text: `Email login owner sekarang ${newEmail}. Semua sesi lama sudah dicabut. Hubungi tim Aijou segera jika perubahan ini tidak kamu kenali.`,
    html: `<p>Email login owner <strong>${escapeEmailHtml(businessName)}</strong> sekarang <strong>${escapeEmailHtml(newEmail)}</strong>.</p><p>Semua sesi lama sudah dicabut. Hubungi tim Aijou segera jika perubahan ini tidak kamu kenali.</p>`,
    idempotencyKey: `owner-email-complete-${createHmac("sha256", getOtpSecret()).update(`${to}:${newEmail}`).digest("hex").slice(0, 32)}-${destination}`,
  });
}
