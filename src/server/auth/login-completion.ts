import { UserStatus } from "@/generated/prisma-beta/client";
import { recordLoginSuccess } from "@/lib/durable-login-guard";
import { prisma } from "@/lib/prisma";
import { createSessionCookie } from "@/lib/session";
import { createTrustedDeviceCookie } from "@/lib/trusted-device";

export async function completeLogin(
  user: {
    id: string;
    email: string;
    passwordHash: string;
    status: UserStatus;
  },
  clientIp: string,
  trustDevice: boolean,
) {
  const deletionCancelled = user.status === UserStatus.DELETION_PENDING;
  const now = new Date();
  const activated = await prisma.user.updateMany({
    where: {
      id: user.id,
      passwordHash: user.passwordHash,
      status: user.status,
      emailVerifiedAt: { not: null },
    },
    data: {
      lastLoginAt: now,
      lastSeenAt: now,
      ...(deletionCancelled
        ? { status: UserStatus.ACTIVE, deletionRequestedAt: null }
        : {}),
    },
  });
  if (activated.count !== 1) return { completed: false, deletionCancelled: false };

  await recordLoginSuccess(user.email, clientIp);
  await createSessionCookie({ userId: user.id, passwordHash: user.passwordHash });
  if (trustDevice) {
    await createTrustedDeviceCookie(user);
  }
  return { completed: true, deletionCancelled };
}
