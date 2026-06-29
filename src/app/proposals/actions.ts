"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { generateProposalDraftFromLead } from "@/server/proposals/proposal-drafts";

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
