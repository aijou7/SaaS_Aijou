import { Prisma, WorkspaceRole } from "@/generated/prisma-beta/client";
import { newWorkspaceAgentDefaults } from "@/server/agent/defaults";

type EmptyWorkspaceInput = {
  ownerId: string;
  businessName: string;
  signupSource: "PUBLIC" | "BETA_INVITE";
};

/**
 * Creates only the records required to open a secure workspace.
 * Customer-facing data stays empty until the owner adds or receives it.
 */
export async function createEmptyOwnedWorkspace(
  tx: Prisma.TransactionClient,
  input: EmptyWorkspaceInput,
) {
  const business = await tx.business.create({
    data: {
      id: `${input.ownerId}:default`,
      userId: input.ownerId,
      businessName: input.businessName,
      businessType: null,
    },
    select: { id: true, businessName: true },
  });

  await tx.agentSettings.create({
    data: {
      businessId: business.id,
      ...newWorkspaceAgentDefaults(input.businessName),
    },
  });
  await tx.workspaceMembership.create({
    data: {
      businessId: business.id,
      userId: input.ownerId,
      role: WorkspaceRole.OWNER,
    },
  });
  await tx.activationEvent.create({
    data: {
      businessId: business.id,
      type: "SIGNUP",
      metadata: { source: input.signupSource },
    },
  });

  return business;
}
