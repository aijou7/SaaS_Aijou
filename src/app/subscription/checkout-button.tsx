"use client";

import { useActionState, useEffect } from "react";
import { CreditCard } from "lucide-react";
import {
  createSubscriptionCheckoutAction,
  type CheckoutActionState,
} from "@/app/subscription/actions";
import type { BillingCycle, PublicPlanId } from "@/lib/subscription-plans";

export function SubscriptionCheckoutButton({
  plan,
  billingCycle,
  disabled = false,
}: {
  plan: PublicPlanId;
  billingCycle: BillingCycle;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<CheckoutActionState, FormData>(
    createSubscriptionCheckoutAction,
    {},
  );

  useEffect(() => {
    if (state.redirectUrl) window.location.assign(state.redirectUrl);
  }, [state.redirectUrl]);

  return (
    <form action={action} className="subscription-checkout-form">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="billingCycle" value={billingCycle} />
      <button
        className="primary-button icon-link"
        type="submit"
        disabled={disabled || pending}
        aria-disabled={disabled || pending}
      >
        <CreditCard size={17} aria-hidden="true" />
        {pending ? "Membuka pembayaran..." : "Pilih & bayar"}
      </button>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    </form>
  );
}
