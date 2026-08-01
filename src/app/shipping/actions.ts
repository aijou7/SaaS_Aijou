"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createShippingRate, toggleShippingRate } from "@/server/operations/shipping";
export async function createShippingRateAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await createShippingRate(session.userId,formData);revalidatePath('/shipping');redirect('/shipping?created=1')}
export async function toggleShippingRateAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await toggleShippingRate(session.userId,String(formData.get('rateId')??''));revalidatePath('/shipping');redirect('/shipping?updated=1')}
