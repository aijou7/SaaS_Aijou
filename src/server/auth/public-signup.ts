import { createHmac } from "node:crypto";
import { UserRole } from "@/generated/prisma-beta/client";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  isPublicSignupEnabled,
  normalizePublicSignupInput,
  PublicSignupError,
  publicSignupRateRules,
  type PublicSignupInput,
} from "@/server/auth/public-signup-validation";

export {
  isPublicSignupEnabled,
  normalizePublicSignupInput,
  PublicSignupError,
  publicSignupRateRules,
} from "@/server/auth/public-signup-validation";
export type {
  NormalizedPublicSignupInput,
  PublicSignupInput,
} from "@/server/auth/public-signup-validation";

export async function createPublicBetaAccount(
  input: PublicSignupInput,
  context: { clientIp: string },
) {
  if (!isPublicSignupEnabled()) {
    throw new PublicSignupError(
      "Pendaftaran publik sedang ditutup. Gunakan link invite jika sudah memilikinya.",
      "DISABLED",
    );
  }

  const normalized = normalizePublicSignupInput(input);
  await enforcePublicSignupRateLimit(context.clientIp, normalized.email);

  // Hash before attempting the insert so an existing email and a new email
  // have roughly the same expensive password-work path.
  const passwordHash = await hashPassword(normalized.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: normalized.name,
          email: normalized.email,
          phoneNumber: normalized.phoneNumber,
          passwordHash,
          role: UserRole.OWNER,
        },
        select: { id: true, email: true, passwordHash: true },
      });

      const business = await tx.business.create({
        data: {
          id: `${user.id}:default`,
          userId: user.id,
          businessName: normalized.businessName,
          businessType: "Belum diisi",
        },
        select: { id: true },
      });

      await tx.agentSettings.create({
        data: {
          businessId: business.id,
          agentName: "Aijou",
          tone: "friendly, helpful, concise",
          language: "id",
          businessDescription: normalized.businessName,
          handoffRules:
            "Handoff jika customer meminta manusia, meminta harga final, komplain, atau kebutuhan perlu keputusan owner.",
          systemInstruction:
            "Pahami kebutuhan secara natural, gunakan knowledge bisnis, jangan mengarang harga, dan arahkan ke langkah berikutnya.",
        },
      });

      return {
        userId: user.id,
        email: user.email,
        passwordHash: user.passwordHash,
      };
    });
  } catch (error) {
    if (isUniqueEmailError(error)) {
      throw new PublicSignupError(
        "Akun belum dapat dibuat. Jika email sudah terdaftar, silakan masuk.",
        "DUPLICATE",
      );
    }

    throw error;
  }
}

export function getSafePublicSignupError(error: unknown) {
  if (error instanceof PublicSignupError) return error.message;
  return "Pendaftaran belum berhasil. Coba lagi beberapa saat.";
}

export async function prunePublicSignupRateLimits() {
  const result = await prisma.signupRateLimit.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60_000) } },
  });
  return result.count;
}

async function enforcePublicSignupRateLimit(clientIp: string, email: string) {
  const subjects = {
    ip: clientIp.trim() && clientIp !== "unknown" ? clientIp.trim() : null,
    email,
  } as const;
  let longestRetrySeconds = 0;

  // Each counter is an atomic PostgreSQL upsert, so limits remain useful when
  // requests land on different serverless instances.
  for (const rule of publicSignupRateRules) {
    const subject = subjects[rule.subject];
    if (!subject) continue;

    const keyHash = digestRateLimitKey(rule.scope, subject);
    const rows = await prisma.$queryRaw<Array<{ count: number; retrySeconds: number }>>`
      INSERT INTO "signup_rate_limits"
        ("keyHash", "scope", "count", "windowStartedAt", "expiresAt", "updatedAt")
      VALUES
        (${keyHash}, ${rule.scope}, 1, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + (${rule.windowMs} * INTERVAL '1 millisecond'), CURRENT_TIMESTAMP)
      ON CONFLICT ("keyHash") DO UPDATE SET
        "count" = CASE
          WHEN "signup_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
          ELSE "signup_rate_limits"."count" + 1
        END,
        "windowStartedAt" = CASE
          WHEN "signup_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
          ELSE "signup_rate_limits"."windowStartedAt"
        END,
        "expiresAt" = CASE
          WHEN "signup_rate_limits"."expiresAt" <= CURRENT_TIMESTAMP
            THEN CURRENT_TIMESTAMP + (${rule.windowMs} * INTERVAL '1 millisecond')
          ELSE "signup_rate_limits"."expiresAt"
        END,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING
        "count",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP))))::int AS "retrySeconds"
    `;
    const result = rows[0];

    if (result && result.count > rule.max) {
      longestRetrySeconds = Math.max(longestRetrySeconds, result.retrySeconds);
    }
  }

  if (longestRetrySeconds > 0) {
    const minutes = Math.max(1, Math.ceil(longestRetrySeconds / 60));
    throw new PublicSignupError(
      `Terlalu banyak percobaan pendaftaran. Coba lagi sekitar ${minutes} menit.`,
      "RATE_LIMITED",
    );
  }
}

function digestRateLimitKey(scope: string, subject: string) {
  const secret =
    process.env.SIGNUP_GUARD_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    "aijou-local-signup-guard-only";

  return createHmac("sha256", secret)
    .update(`${scope}\0${subject.trim().toLowerCase()}`)
    .digest("base64url");
}

function isUniqueEmailError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
    return false;
  }

  const target = "meta" in error ? JSON.stringify(error.meta) : "";
  return /email/i.test(target);
}
