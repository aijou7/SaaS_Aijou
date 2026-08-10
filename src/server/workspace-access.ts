import { Prisma, WorkspaceRole } from "@/generated/prisma-beta/client";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspaceId } from "@/lib/workspace-cookie";

export type WorkspaceAccess = {
  businessId: string;
  businessName: string;
  ownerId: string;
  role: WorkspaceRole;
};

export function workspaceAccessWhere(
  userId: string,
  businessId?: string | null,
): Prisma.BusinessWhereInput {
  return {
    ...(businessId ? { id: businessId } : {}),
    OR: [
      { userId },
      { memberships: { some: { userId, isActive: true } } },
    ],
  };
}

export const getWorkspaceAccess = cache(async function getWorkspaceAccess(
  userId: string,
): Promise<WorkspaceAccess | null> {
  const activeWorkspaceId = await getActiveWorkspaceId();
  const business = await prisma.business.findFirst({
    where: workspaceAccessWhere(userId, activeWorkspaceId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      businessName: true,
      userId: true,
      memberships: {
        where: { userId, isActive: true },
        take: 1,
        select: { role: true },
      },
    },
  });

  if (!business && activeWorkspaceId) {
    return getFirstWorkspaceAccess(userId);
  }

  if (!business) return null;

  return {
    businessId: business.id,
    businessName: business.businessName,
    ownerId: business.userId,
    role:
      business.userId === userId
        ? WorkspaceRole.OWNER
        : business.memberships[0]?.role ?? WorkspaceRole.VIEWER,
  };
});

export async function activeWorkspaceAccessWhere(
  userId: string,
): Promise<Prisma.BusinessWhereInput> {
  const access = await getWorkspaceAccess(userId);
  return workspaceAccessWhere(userId, access?.businessId ?? "__no_workspace__");
}

async function getFirstWorkspaceAccess(userId: string): Promise<WorkspaceAccess | null> {
  const business = await prisma.business.findFirst({
    where: workspaceAccessWhere(userId),
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      businessName: true,
      userId: true,
      memberships: {
        where: { userId, isActive: true },
        take: 1,
        select: { role: true },
      },
    },
  });
  if (!business) return null;
  return {
    businessId: business.id,
    businessName: business.businessName,
    ownerId: business.userId,
    role:
      business.userId === userId
        ? WorkspaceRole.OWNER
        : business.memberships[0]?.role ?? WorkspaceRole.VIEWER,
  };
}

export async function requireWorkspaceAccess(
  userId: string,
  allowedRoles: readonly WorkspaceRole[] = Object.values(WorkspaceRole),
) {
  const access = await getWorkspaceAccess(userId);
  if (!access) throw new Error("Workspace tidak ditemukan.");
  if (!allowedRoles.includes(access.role)) {
    throw new Error("Kamu tidak memiliki izin untuk tindakan ini.");
  }
  return access;
}

export async function ensureOwnerMembership(userId: string, businessId: string) {
  return prisma.workspaceMembership.upsert({
    where: { businessId_userId: { businessId, userId } },
    update: { role: WorkspaceRole.OWNER, isActive: true },
    create: { businessId, userId, role: WorkspaceRole.OWNER },
  });
}
