import { WorkspaceRole } from "@/generated/prisma-beta/client";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAccess } from "@/server/workspace-access";
import { assertWorkspaceFeature } from "@/server/subscriptions/subscriptions";

const roles = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.AGENT];

export async function getCustomersPage(userId: string, segmentId?: string) {
  const access = await requireWorkspaceAccess(userId);
  const [segments, contacts] = await Promise.all([
    prisma.customerSegment.findMany({
      where: { businessId: access.businessId },
      orderBy: { name: "asc" },
      include: { _count: { select: { memberships: true } } },
    }),
    prisma.contact.findMany({
      where: {
        businessId: access.businessId,
        ...(segmentId ? { segmentMemberships: { some: { segmentId } } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
      include: { segmentMemberships: { include: { segment: true } } },
    }),
  ]);
  return { businessName: access.businessName, segments, contacts };
}

export async function createSegment(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]);
  await assertWorkspaceFeature(access.businessId, "CUSTOMER_SEGMENTS");
  const name = clean(formData.get("name"), 80);
  if (!name) throw new Error("Nama segmen wajib diisi.");
  return prisma.customerSegment.create({
    data: {
      businessId: access.businessId,
      name,
      description: clean(formData.get("description"), 300) || null,
      color: normalizeColor(clean(formData.get("color"), 16)),
    },
  });
}

export async function updateContactAudience(userId: string, formData: FormData) {
  const access = await requireWorkspaceAccess(userId, roles);
  await assertWorkspaceFeature(access.businessId, "CUSTOMER_SEGMENTS");
  const contactId = clean(formData.get("contactId"), 64);
  const segmentId = clean(formData.get("segmentId"), 64);
  const action = clean(formData.get("audienceAction"), 30);
  const contact = await prisma.contact.findFirst({ where: { id: contactId, businessId: access.businessId }, select: { id: true } });
  if (!contact) throw new Error("Kontak tidak ditemukan.");

  if (action === "OPT_IN") {
    await prisma.contact.update({ where: { id: contactId }, data: { marketingOptInAt: new Date(), marketingOptOutAt: null } });
    return;
  }
  if (action === "OPT_OUT") {
    await prisma.contact.update({ where: { id: contactId }, data: { marketingOptOutAt: new Date() } });
    return;
  }
  if (!segmentId) throw new Error("Pilih segmen terlebih dahulu.");
  const segment = await prisma.customerSegment.findFirst({ where: { id: segmentId, businessId: access.businessId }, select: { id: true } });
  if (!segment) throw new Error("Segmen tidak ditemukan.");
  if (action === "REMOVE_SEGMENT") {
    await prisma.contactSegment.deleteMany({ where: { contactId, segmentId } });
  } else {
    await prisma.contactSegment.upsert({
      where: { contactId_segmentId: { contactId, segmentId } },
      update: {},
      create: { contactId, segmentId },
    });
  }
}

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#2563eb";
}
