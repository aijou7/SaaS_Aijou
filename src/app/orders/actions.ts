"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { createOrder, updateOrderStatus } from "@/server/operations/orders";
export async function createOrderAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await createOrder(session.userId,formData);revalidatePath('/orders');redirect('/orders?created=1')}
export async function updateOrderStatusAction(formData:FormData){const session=await getSession();if(!session)redirect('/login');await updateOrderStatus(session.userId,formData);revalidatePath('/orders');redirect('/orders?updated=1')}
