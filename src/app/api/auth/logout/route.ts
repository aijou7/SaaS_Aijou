import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders, validateMutationRequest } from "@/lib/request-security";
import { getSafeInternalRedirectPath } from "@/lib/safe-navigation";
import { clearSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const securityError = validateMutationRequest(request, "form");
  if (securityError) return securityError;

  await clearSessionCookie();

  const nextPath = getSafeInternalRedirectPath(request.nextUrl.searchParams.get("next"));

  return NextResponse.redirect(new URL(nextPath ?? "/login", request.url), {
    status: 303,
    headers: noStoreHeaders,
  });
}
