"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createWorkflow, toggleWorkflow } from "@/server/operations/workflows";
export async function createWorkflowAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await createWorkflow(session.userId,formData);revalidatePath('/workflows');redirect('/workflows?created=1')}
export async function toggleWorkflowAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await toggleWorkflow(session.userId,String(formData.get('workflowId')??''));revalidatePath('/workflows');redirect('/workflows?updated=1')}
