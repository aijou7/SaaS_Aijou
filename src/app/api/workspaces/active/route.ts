import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getWorkspaceHome } from "@/lib/workspace-permissions";
import { setActiveWorkspaceCookie } from "@/lib/workspace-cookie";
import { noStoreHeaders, validateMutationRequest } from "@/lib/request-security";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const securityError = validateMutationRequest(request, "form");
  if (securityError) return securityError;

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const formData = await request.formData();
  const businessId = String(formData.get("businessId") ?? "").trim();
  const workspace = await prisma.business.findFirst({
    where: {
      id: businessId,
      OR: [
        { userId: session.userId },
        { memberships: { some: { userId: session.userId, isActive: true } } },
      ],
    },
    select: {
      userId: true,
      memberships: {
        where: { userId: session.userId, isActive: true },
        take: 1,
        select: { role: true },
      },
    },
  });

  if (!workspace) {
    return NextResponse.json(
      { error: "Workspace tidak ditemukan atau akses sudah dicabut." },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const role = workspace.userId === session.userId
    ? "OWNER" as const
    : workspace.memberships[0]?.role ?? "VIEWER" as const;
  await setActiveWorkspaceCookie(businessId);

  return NextResponse.redirect(new URL(getWorkspaceHome(role), request.url), {
    status: 303,
    headers: noStoreHeaders,
  });
}
