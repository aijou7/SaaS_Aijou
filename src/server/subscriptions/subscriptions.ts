import {
  Prisma,
  SubscriptionBillingCycle,
  SubscriptionPlan,
  WorkspaceSubscriptionStatus,
} from "@/generated/prisma-beta/client";
import {
  getSubscriptionPlan,
  toPublicPlanId,
  type BillingCycle,
  type PublicPlanId,
  type StoredPlanId,
  type SubscriptionFeature,
} from "@/lib/subscription-plans";
import { prisma } from "@/lib/prisma";

export const PUBLIC_TRIAL_LIMIT = 100;
const publicTrialCounterKey = "public_trial_claims";

const betaEntitlements: SubscriptionFeature[] = [
  "CORE_INBOX",
  "WEB_CHAT",
  "TELEGRAM",
  "WHATSAPP",
  "KNOWLEDGE",
  "HUMAN_TAKEOVER",
  "BASIC_REPORTS",
  "BROADCAST",
  "CUSTOMER_SEGMENTS",
  "WORKFLOWS",
  "ORDERS",
  "COMPLAINTS",
  "ADVANCED_REPORTS",
  "API_WEBHOOKS",
  "PRIORITY_SUPPORT",
];

export type WorkspaceEntitlements = {
  plan: StoredPlanId;
  planName: string;
  status: WorkspaceSubscriptionStatus | "LEGACY_FALLBACK";
  billingCycle: BillingCycle;
  seatLimit: number | null;
  monthlyAiCredits: number | null;
  features: SubscriptionFeature[];
  accessActive: boolean;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  graceEndsAt: Date | null;
};

export function createInitialWorkspaceSubscription(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    signupSource: "PUBLIC" | "BETA_INVITE";
    plan?: PublicPlanId;
    billingCycle?: BillingCycle;
  },
) {
  if (input.signupSource === "BETA_INVITE") {
    return tx.workspaceSubscription.create({
      data: {
        businessId: input.businessId,
        plan: SubscriptionPlan.BETA,
        billingCycle: SubscriptionBillingCycle.MONTHLY,
        status: WorkspaceSubscriptionStatus.ACTIVE,
        activatedAt: new Date(),
      },
    });
  }

  const plan = input.plan ?? "starter";
  return tx.workspaceSubscription.create({
    data: {
      businessId: input.businessId,
      plan: plan.toUpperCase() as SubscriptionPlan,
      billingCycle: (input.billingCycle ?? "monthly").toUpperCase() as SubscriptionBillingCycle,
      status: WorkspaceSubscriptionStatus.PENDING_ACTIVATION,
    },
  });
}

export async function activateVerifiedWorkspaceSubscriptions(
  tx: Prisma.TransactionClient,
  userId: string,
  now = new Date(),
) {
  const subscriptions = await tx.workspaceSubscription.findMany({
    where: {
      business: { userId },
      status: WorkspaceSubscriptionStatus.PENDING_ACTIVATION,
    },
    select: { id: true, plan: true },
  });

  for (const subscription of subscriptions) {
    const publicPlan = toPublicPlanId(subscription.plan as StoredPlanId);
    const definition = publicPlan ? getSubscriptionPlan(publicPlan) : null;
    if (definition?.trialDays) {
      const claimNumber = await claimPublicTrialSlot(tx);
      if (!claimNumber) {
        await tx.workspaceSubscription.update({
          where: { id: subscription.id },
          data: { status: WorkspaceSubscriptionStatus.PENDING_PAYMENT },
        });
        continue;
      }
      await tx.workspaceSubscription.update({
        where: { id: subscription.id },
        data: {
          status: WorkspaceSubscriptionStatus.TRIALING,
          trialStartsAt: now,
          trialEndsAt: new Date(now.getTime() + definition.trialDays * 86_400_000),
          trialClaimNumber: claimNumber,
          trialClaimedAt: now,
          activatedAt: now,
        },
      });
    } else {
      await tx.workspaceSubscription.update({
        where: { id: subscription.id },
        data: { status: WorkspaceSubscriptionStatus.PENDING_PAYMENT },
      });
    }
  }
}

export async function getPublicTrialAvailability() {
  const counter = await prisma.platformCounter.findUnique({
    where: { key: publicTrialCounterKey },
    select: { value: true },
  });
  const claimed = Math.min(PUBLIC_TRIAL_LIMIT, Math.max(0, counter?.value ?? 0));
  return {
    limit: PUBLIC_TRIAL_LIMIT,
    claimed,
    remaining: Math.max(0, PUBLIC_TRIAL_LIMIT - claimed),
    available: claimed < PUBLIC_TRIAL_LIMIT,
  };
}

async function claimPublicTrialSlot(tx: Prisma.TransactionClient) {
  const rows = await tx.$queryRaw<Array<{ value: number }>>(Prisma.sql`
    INSERT INTO "platform_counters" ("key", "value", "updatedAt")
    VALUES (${publicTrialCounterKey}, 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("key") DO UPDATE SET
      "value" = "platform_counters"."value" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "platform_counters"."value" < ${PUBLIC_TRIAL_LIMIT}
    RETURNING "value"
  `);
  return rows[0]?.value ?? null;
}

export async function getWorkspaceEntitlements(
  businessId: string,
  now = new Date(),
): Promise<WorkspaceEntitlements> {
  const subscription = await prisma.workspaceSubscription.findUnique({
    where: { businessId },
  });

  // Safe fallback for workspaces created while a deployment and its migration
  // overlap. Never interrupt an established workspace because one row is late.
  if (!subscription) return legacyFallbackEntitlements();

  if (subscription.plan === SubscriptionPlan.BETA) {
    return {
      plan: "BETA",
      planName: "Beta legacy",
      status: subscription.status,
      billingCycle: "monthly",
      seatLimit: null,
      monthlyAiCredits: null,
      features: betaEntitlements,
      accessActive: true,
      trialEndsAt: subscription.trialEndsAt,
      currentPeriodEndsAt: subscription.currentPeriodEndsAt,
      graceEndsAt: subscription.graceEndsAt,
    };
  }

  const publicPlan = subscription.plan.toLowerCase() as PublicPlanId;
  const definition = getSubscriptionPlan(publicPlan);
  if (!definition) return legacyFallbackEntitlements();
  const trialActive =
    subscription.status === WorkspaceSubscriptionStatus.TRIALING &&
    Boolean(subscription.trialEndsAt && subscription.trialEndsAt > now);
  const paidPeriodActive =
    subscription.status === WorkspaceSubscriptionStatus.ACTIVE &&
    Boolean(subscription.currentPeriodEndsAt && subscription.currentPeriodEndsAt > now);
  const graceActive =
    subscription.status === WorkspaceSubscriptionStatus.PAST_DUE &&
    Boolean(subscription.graceEndsAt && subscription.graceEndsAt > now);

  return {
    plan: subscription.plan as StoredPlanId,
    planName: definition.name,
    status: subscription.status,
    billingCycle: subscription.billingCycle === SubscriptionBillingCycle.ANNUAL
      ? "annual"
      : "monthly",
    seatLimit: definition.seatLimit,
    monthlyAiCredits: definition.monthlyAiCredits,
    features: definition.entitlements,
    accessActive: trialActive || paidPeriodActive || graceActive,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEndsAt: subscription.currentPeriodEndsAt,
    graceEndsAt: subscription.graceEndsAt,
  };
}

export async function assertWorkspaceSeatAvailable(
  tx: Prisma.TransactionClient,
  businessId: string,
) {
  const subscription = await tx.workspaceSubscription.findUnique({
    where: { businessId },
    select: { plan: true },
  });
  if (!subscription || subscription.plan === SubscriptionPlan.BETA) return;
  const definition = getSubscriptionPlan(subscription.plan.toLowerCase());
  if (!definition) return;

  const activeSeats = await tx.workspaceMembership.count({
    where: { businessId, isActive: true },
  });
  if (activeSeats >= definition.seatLimit) {
    throw new Error(
      `Paket ${definition.name} mendukung ${definition.seatLimit} anggota aktif. Upgrade paket sebelum menambah anggota baru.`,
    );
  }
}

export function subscriptionCanUseAi(entitlements: WorkspaceEntitlements) {
  return entitlements.accessActive;
}

export async function assertWorkspaceFeature(
  businessId: string,
  feature: SubscriptionFeature,
) {
  const entitlements = await getWorkspaceEntitlements(businessId);
  if (!entitlements.features.includes(feature)) {
    throw new Error(
      `Fitur ini tidak termasuk paket ${entitlements.planName}. Upgrade paket untuk mengaktifkannya.`,
    );
  }
  if (!entitlements.accessActive) {
    throw new Error("Trial atau paket workspace perlu diaktifkan sebelum memakai fitur ini.");
  }
  return entitlements;
}

function legacyFallbackEntitlements(): WorkspaceEntitlements {
  return {
    plan: "BETA",
    planName: "Beta legacy",
    status: "LEGACY_FALLBACK",
    billingCycle: "monthly",
    seatLimit: null,
    monthlyAiCredits: null,
    features: betaEntitlements,
    accessActive: true,
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    graceEndsAt: null,
  };
}
