import {
  ComplaintPriority,
  ComplaintStatus,
  Prisma,
  WorkspaceRole,
} from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { runWorkflowsForTrigger } from "@/server/operations/workflows";
import { requireWorkspaceAccess } from "@/server/workspace-access";

const operatorRoles = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.AGENT];

export async function getComplaintsPage(userId: string, status?: string) {
  const access = await requireWorkspaceAccess(userId, operatorRoles);
  const normalizedStatus = Object.values(ComplaintStatus).includes(status as ComplaintStatus)
    ? (status as ComplaintStatus)
    : undefined;
  const [complaints, grouped, contacts, users] = await Promise.all([
    prisma.complaint.findMany({
      where: { businessId: access.businessId, ...(normalizedStatus ? { status: normalizedStatus } : {}) },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        contact: { select: { id: true, displayName: true, phoneNumber: true } },
        assignedToUser: { select: { id: true, name: true } },
        events: { orderBy: { createdAt: "desc" }, take: 3 },
      },
    }),
    prisma.complaint.groupBy({
      by: ["status"],
      where: { businessId: access.businessId },
      _count: true,
    }),
    prisma.contact.findMany({
      where: { businessId: access.businessId },
      orderBy: { updatedAt: "desc" },
      take: 200,
      select: { id: true, displayName: true, phoneNumber: true },
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { businesses: { some: { id: access.businessId } } },
          { memberships: { some: { businessId: access.businessId, isActive: true } } },
        ],
      },
      select: { id: true, name: true },
    }),
  ]);
  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count]));
  const terminalStatuses: ComplaintStatus[] = [
    ComplaintStatus.RESOLVED,
    ComplaintStatus.CLOSED,
  ];
  const overdue = complaints.filter(
    (item) => item.slaDueAt && item.slaDueAt < new Date() && !terminalStatuses.includes(item.status),
  ).length;
  return { businessName: access.businessName, complaints, counts, overdue, contacts, users };
}

export async function createComplaint(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, operatorRoles);
  const title = clean(formData.get("title"), 180);
  const description = clean(formData.get("description"), 4_000);
  if (!title || !description) throw new Error("Judul dan detail komplain wajib diisi.");
  const priority = normalizePriority(formData.get("priority"));
  const contactId = clean(formData.get("contactId"), 64) || null;
  if (contactId) await assertContact(access.businessId, contactId);
  const now = new Date();
  const ticketNumber = `CMP-${now.toISOString().slice(2, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
  const complaint = await prisma.complaint.create({
    data: {
      businessId: access.businessId,
      ticketNumber,
      contactId,
      assignedToUserId: clean(formData.get("assignedToUserId"), 64) || null,
      title,
      description,
      category: clean(formData.get("category"), 80) || null,
      priority,
      slaDueAt: new Date(now.getTime() + slaHours(priority) * 60 * 60_000),
      events: { create: { actorId: userId, type: "CREATED", note: "Komplain dibuat." } },
    },
  });
  await runWorkflowsForTrigger(access.businessId, "COMPLAINT_CREATED", {
    triggerType: "COMPLAINT_CREATED",
    complaintId: complaint.id,
    contactId: complaint.contactId,
    ticketNumber: complaint.ticketNumber,
    priority: complaint.priority,
  });
  return complaint;
}

export async function updateComplaint(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, operatorRoles);
  const complaintId = clean(formData.get("complaintId"), 64);
  const status = normalizeStatus(formData.get("status"));
  const priority = normalizePriority(formData.get("priority"));
  const note = clean(formData.get("note"), 2_000);
  const existing = await prisma.complaint.findFirst({ where: { id: complaintId, businessId: access.businessId } });
  if (!existing) throw new Error("Komplain tidak ditemukan.");
  const now = new Date();
  const data: Prisma.ComplaintUpdateInput = {
    status,
    priority,
    assignedToUser: clean(formData.get("assignedToUserId"), 64)
      ? { connect: { id: clean(formData.get("assignedToUserId"), 64) } }
      : { disconnect: true },
    firstResponseAt: existing.firstResponseAt ?? (status !== ComplaintStatus.OPEN ? now : null),
    resolvedAt: status === ComplaintStatus.RESOLVED ? now : existing.resolvedAt,
    closedAt: status === ComplaintStatus.CLOSED ? now : null,
    ...(priority !== existing.priority ? { slaDueAt: new Date(now.getTime() + slaHours(priority) * 60 * 60_000) } : {}),
  };
  await prisma.$transaction([
    prisma.complaint.update({ where: { id: complaintId }, data }),
    prisma.complaintEvent.create({
      data: {
        complaintId,
        actorId: userId,
        type: existing.status !== status ? "STATUS_CHANGED" : "NOTE_ADDED",
        note: note || `${existing.status} → ${status}`,
        metadata: { previousStatus: existing.status, status, priority },
      },
    }),
  ]);
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePriority(value: FormDataEntryValue | null) {
  return Object.values(ComplaintPriority).includes(value as ComplaintPriority)
    ? (value as ComplaintPriority)
    : ComplaintPriority.NORMAL;
}

function normalizeStatus(value: FormDataEntryValue | null) {
  return Object.values(ComplaintStatus).includes(value as ComplaintStatus)
    ? (value as ComplaintStatus)
    : ComplaintStatus.OPEN;
}

function slaHours(priority: ComplaintPriority) {
  return { LOW: 72, NORMAL: 24, HIGH: 8, URGENT: 2 }[priority];
}

async function assertContact(businessId: string, contactId: string) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, businessId }, select: { id: true } });
  if (!contact) throw new Error("Kontak tidak ditemukan di workspace ini.");
}
