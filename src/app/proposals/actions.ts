"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  deleteProposalDraft,
  generateProposalDraftFromLead,
  sendProposalDraftFollowUp,
  updateProposalDraftStatus,
  updateProposalDraftContent,
} from "@/server/proposals/proposal-drafts";

export async function generateProposalDraftAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const leadId = String(formData.get("leadId") ?? "");
  await generateProposalDraftFromLead(session.userId, leadId);

  revalidatePath("/leads");
  revalidatePath("/proposals");
}

export async function updateProposalDraftStatusAction(formData: FormData) {
  const session = await getRequiredSession();
  const proposalId = String(formData.get("proposalId") ?? "");
  const status = String(formData.get("status") ?? "DRAFT");

  await updateProposalDraftStatus(session.userId, proposalId, status);
  revalidateProposalPages();
}

export async function updateProposalDraftContentAction(formData: FormData) {
  const session = await getRequiredSession();
  const proposalId = String(formData.get("proposalId") ?? "");
  await updateProposalDraftContent(session.userId, proposalId, formData);
  revalidateProposalPages();
  redirect(`/proposals?updated=${encodeURIComponent(proposalId)}`);
}

export async function sendProposalFollowUpAction(formData: FormData) {
  const session = await getRequiredSession();
  const proposalId = String(formData.get("proposalId") ?? "");

  await sendProposalDraftFollowUp(session.userId, proposalId);
  revalidateProposalPages();
  revalidatePath("/conversations");
}

export async function deleteProposalDraftAction(formData: FormData) {
  const session = await getRequiredSession();
  const proposalId = String(formData.get("proposalId") ?? "");

  await deleteProposalDraft(session.userId, proposalId);
  revalidateProposalPages();
}

async function getRequiredSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function revalidateProposalPages() {
  revalidatePath("/leads");
  revalidatePath("/proposals");
}
