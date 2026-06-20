"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { updateLead } from "@/server/leads/leads";

export async function updateLeadAction(formData: FormData) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const leadId = String(formData.get("leadId") ?? "");
  await updateLead(session.userId, leadId, formData);
  revalidatePath("/leads");
  revalidatePath("/");
}
