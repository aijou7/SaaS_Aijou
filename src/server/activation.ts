import type { Prisma } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";

export const activationTypes = {
  signup: "SIGNUP",
  profileCompleted: "PROFILE_COMPLETED",
  firstKnowledge: "FIRST_KNOWLEDGE",
  firstSimulation: "FIRST_SIMULATION",
  firstChannel: "FIRST_CHANNEL_CONNECTED",
  agentActivated: "AGENT_ACTIVATED",
  firstCustomerMessage: "FIRST_CUSTOMER_MESSAGE",
  firstTakeover: "FIRST_TAKEOVER",
  firstLead: "FIRST_LEAD",
  firstPayment: "FIRST_PAYMENT",
} as const;

export async function recordActivationEvent(
  businessId: string,
  type: (typeof activationTypes)[keyof typeof activationTypes] | string,
  metadata?: Prisma.InputJsonValue,
) {
  return prisma.activationEvent.upsert({
    where: { businessId_type: { businessId, type } },
    update: metadata === undefined ? {} : { metadata },
    create: { businessId, type, ...(metadata === undefined ? {} : { metadata }) },
  });
}

export async function getActivationTimeline(businessId: string) {
  const events = await prisma.activationEvent.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    select: { type: true, metadata: true, createdAt: true },
  });
  return new Map(events.map((event) => [event.type, event]));
}
