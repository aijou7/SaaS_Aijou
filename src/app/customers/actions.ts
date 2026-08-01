"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createSegment, updateContactAudience } from "@/server/operations/segments";
export async function createSegmentAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await createSegment(session.userId,formData);revalidatePath('/customers');redirect('/customers?created=1')}
export async function updateContactAudienceAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await updateContactAudience(session.userId,formData);revalidatePath('/customers');redirect('/customers?saved=1')}
