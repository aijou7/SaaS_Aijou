"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createBroadcast, pauseBroadcast, startBroadcast } from "@/server/operations/broadcasts";
export async function createBroadcastAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await createBroadcast(session.userId,formData);revalidatePath('/broadcasts');redirect('/broadcasts?created=1')}
export async function startBroadcastAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await startBroadcast(session.userId,String(formData.get('campaignId')??''));revalidatePath('/broadcasts');redirect('/broadcasts?started=1')}
export async function pauseBroadcastAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await pauseBroadcast(session.userId,String(formData.get('campaignId')??''));revalidatePath('/broadcasts');redirect('/broadcasts?updated=1')}
