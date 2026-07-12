import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders, validateMutationRequest } from "@/lib/request-security";
import { clearSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const securityError = validateMutationRequest(request, "form");
  if (securityError) return securityError;

  await clearSessionCookie();

  return NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
    headers: noStoreHeaders,
  });
}
