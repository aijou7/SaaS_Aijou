"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import {
  createSubscriptionCheckout,
  getSafeSubscriptionBillingError,
  syncSubscriptionPayment,
} from "@/server/subscriptions/billing";

export type CheckoutActionState = {
  error?: string;
  redirectUrl?: string;
};

export async function createSubscriptionCheckoutAction(
  _state: CheckoutActionState,
  formData: FormData,
): Promise<CheckoutActionState> {
  const session = await getSession();
  if (!session) return { error: "Sesi login berakhir. Silakan masuk kembali." };
  try {
    const checkout = await createSubscriptionCheckout(session.userId, {
      plan: String(formData.get("plan") ?? ""),
      billingCycle: String(formData.get("billingCycle") ?? ""),
    });
    return { redirectUrl: checkout.redirectUrl };
  } catch (error) {
    return { error: getSafeSubscriptionBillingError(error) };
  }
}

export async function syncSubscriptionPaymentAction(formData: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const orderId = String(formData.get("orderId") ?? "").trim();
  try {
    await syncSubscriptionPayment(session.userId, orderId);
  } catch (error) {
    redirect(`/subscription?error=${encodeURIComponent(getSafeSubscriptionBillingError(error))}`);
  }
  revalidatePath("/subscription");
  revalidatePath("/usage");
  redirect("/subscription?synced=1");
}
