import {
  ComplaintPriority,
  ComplaintStatus,
  ConversationStatus,
  Prisma,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkspaceRole,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAccess } from "@/server/workspace-access";

export const workflowTriggers = ["CUSTOMER_MESSAGE", "COMPLAINT_CREATED", "ORDER_CREATED"] as const;
export const workflowActions = ["ADD_CONTACT_TAG", "CREATE_COMPLAINT", "REQUEST_HUMAN", "NOTIFY_TEAM"] as const;
type WorkflowStep = { type: (typeof workflowActions)[number]; value?: string };

export function normalizeWorkflowSteps(value: unknown): WorkflowStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step): step is Record<string, unknown> => Boolean(step && typeof step === "object" && !Array.isArray(step)))
    .map((step) => ({
      type: workflowActions.includes(step.type as WorkflowStep["type"])
        ? (step.type as WorkflowStep["type"])
        : "NOTIFY_TEAM",
      value: typeof step.value === "string" ? step.value.trim().slice(0, 500) : undefined,
    }))
    .slice(0, 10);
}

export async function getWorkflowsPage(userId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const workflows = await prisma.automationWorkflow.findMany({
    where: { businessId: access.businessId },
    orderBy: { updatedAt: "desc" },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 3 } },
  });
  return { businessName: access.businessName, workflows };
}

export async function createWorkflow(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const name = clean(formData.get("name"), 120);
  const triggerType = workflowTriggers.includes(formData.get("triggerType") as (typeof workflowTriggers)[number])
    ? String(formData.get("triggerType"))
    : "CUSTOMER_MESSAGE";
  const steps = normalizeWorkflowSteps(
    [1, 2, 3].map((index) => ({
      type: formData.get(`step_${index}_type`),
      value: formData.get(`step_${index}_value`),
    })).filter((step) => step.type),
  );
  if (!name || steps.length === 0) throw new Error("Nama dan minimal satu aksi workflow wajib diisi.");
  return prisma.automationWorkflow.create({
    data: {
      businessId: access.businessId,
      name,
      description: clean(formData.get("description"), 500) || null,
      triggerType,
      steps: steps as unknown as Prisma.InputJsonValue,
      status: formData.get("activateNow") === "on" ? WorkflowStatus.ACTIVE : WorkflowStatus.DRAFT,
    },
  });
}

export async function toggleWorkflow(userId: string, workflowId: string) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  const workflow = await prisma.automationWorkflow.findFirst({ where: { id: workflowId, businessId: access.businessId } });
  if (!workflow) throw new Error("Workflow tidak ditemukan.");
  await prisma.automationWorkflow.update({
    where: { id: workflow.id },
    data: { status: workflow.status === WorkflowStatus.ACTIVE ? WorkflowStatus.PAUSED : WorkflowStatus.ACTIVE },
  });
}

export async function runWorkflowsForTrigger(
  businessId: string,
  triggerType: (typeof workflowTriggers)[number],
  context: Record<string, unknown>,
) {
  const workflows = await prisma.automationWorkflow.findMany({
    where: { businessId, triggerType, status: WorkflowStatus.ACTIVE },
    take: 20,
  });
  for (const workflow of workflows) {
    const run = await prisma.automationRun.create({
      data: { businessId, workflowId: workflow.id, triggerType, context: context as Prisma.InputJsonValue },
    });
    try {
      const results = [];
      for (const step of normalizeWorkflowSteps(workflow.steps)) {
        results.push(await executeStep(businessId, step, context));
      }
      await prisma.$transaction([
        prisma.automationRun.update({
          where: { id: run.id },
          data: { status: WorkflowRunStatus.COMPLETED, completedAt: new Date(), result: results as unknown as Prisma.InputJsonValue },
        }),
        prisma.automationWorkflow.update({
          where: { id: workflow.id },
          data: { runCount: { increment: 1 }, lastRunAt: new Date(), lastError: null },
        }),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1_000) : "Workflow gagal.";
      await prisma.$transaction([
        prisma.automationRun.update({ where: { id: run.id }, data: { status: WorkflowRunStatus.FAILED, completedAt: new Date(), error: message } }),
        prisma.automationWorkflow.update({ where: { id: workflow.id }, data: { lastRunAt: new Date(), lastError: message } }),
      ]);
    }
  }
}

async function executeStep(businessId: string, step: WorkflowStep, context: Record<string, unknown>) {
  const contactId = typeof context.contactId === "string" ? context.contactId : "";
  const conversationId = typeof context.conversationId === "string" ? context.conversationId : "";
  if (step.type === "ADD_CONTACT_TAG" && contactId && step.value) {
    const contact = await prisma.contact.findFirst({ where: { id: contactId, businessId }, select: { tags: true } });
    if (!contact) return { type: step.type, skipped: "contact_missing" };
    await prisma.contact.update({ where: { id: contactId }, data: { tags: [...new Set([...contact.tags, step.value])] } });
    return { type: step.type, ok: true };
  }
  if (step.type === "REQUEST_HUMAN" && conversationId) {
    await prisma.whatsAppConversation.updateMany({ where: { id: conversationId, businessId }, data: { status: ConversationStatus.HUMAN_NEEDED } });
    return { type: step.type, ok: true };
  }
  if (step.type === "CREATE_COMPLAINT") {
    const now = new Date();
    await prisma.complaint.create({
      data: {
        businessId,
        ticketNumber: `CMP-${now.toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`,
        contactId: contactId || null,
        conversationId: conversationId || null,
        title: step.value || "Komplain dari workflow",
        description: `Dibuat otomatis dari trigger ${context.triggerType ?? "operasional"}.`,
        source: "WORKFLOW",
        priority: ComplaintPriority.NORMAL,
        status: ComplaintStatus.OPEN,
        slaDueAt: new Date(now.getTime() + 24 * 60 * 60_000),
      },
    });
    return { type: step.type, ok: true };
  }
  if (step.type === "NOTIFY_TEAM") {
    const users = await prisma.user.findMany({
      where: { OR: [{ businesses: { some: { id: businessId } } }, { memberships: { some: { businessId, isActive: true } } }] },
      select: { id: true },
    });
    await prisma.workspaceNotification.createMany({
      data: users.map((user) => ({
        businessId,
        userId: user.id,
        type: "WORKFLOW",
        title: "Workflow membutuhkan perhatian",
        body: step.value || "Ada aktivitas baru dari workflow operasional.",
        href: conversationId ? `/conversations?conversationId=${encodeURIComponent(conversationId)}` : "/workflows",
        dedupeKey: `workflow:${crypto.randomUUID()}:${user.id}`,
      })),
    });
    return { type: step.type, ok: true };
  }
  return { type: step.type, skipped: "missing_context" };
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
