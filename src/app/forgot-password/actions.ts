"use server";

import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/lib/abuse-guard";
import { requestPasswordReset } from "@/server/auth/account-lifecycle";

export type ForgotPasswordActionState = {
  submitted?: true;
};

export async function requestPasswordResetAction(
  _previousState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const email = String(formData.get("email") ?? "").slice(0, 254);
  const requestHeaders = await headers();

  try {
    await requestPasswordReset(email, getClientIpFromHeaders(requestHeaders));
  } catch {
    // Recovery responses must not reveal whether an address exists or whether
    // the mail provider is temporarily unavailable.
  }

  return { submitted: true };
}
