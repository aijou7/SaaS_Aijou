import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/abuse-guard";
import {
  checkLoginLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/login-guard";
import { prisma } from "@/lib/prisma";
import { dummyPasswordHash, verifyPassword } from "@/lib/password";
import {
  noStoreHeaders,
  readRequestBodyBuffer,
  RequestBodyTooLargeError,
  validateMutationRequest,
} from "@/lib/request-security";
import { createSessionCookie } from "@/lib/session";

export async function POST(request: NextRequest) {
  const securityError = validateMutationRequest(request, "urlencoded");
  if (securityError) return securityError;

  let formData: URLSearchParams;
  try {
    const body = await readRequestBodyBuffer(request, 16_384);
    formData = new URLSearchParams(body.toString("utf8"));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return loginFailure(request, "invalid_request", "Login payload terlalu besar.", 413);
    }

    return loginFailure(request, "invalid_request", "Invalid login payload.", 400);
  }

  const email = (formData.get("email") ?? "").trim().toLowerCase();
  const password = formData.get("password") ?? "";

  if (!email || !email.includes("@") || email.length > 254 || !password || password.length > 128) {
    return loginFailure(
      request,
      "invalid_credentials",
      "Email atau password tidak valid.",
      400,
    );
  }

  const clientIp = getClientIp(request);
  const loginLimit = checkLoginLimit(email, clientIp);

  if (!loginLimit.allowed) {
    return loginFailure(
      request,
      "rate_limited",
      "Terlalu banyak percobaan login. Coba lagi sebentar.",
      429,
      { "Retry-After": String(loginLimit.retryAfterSeconds) },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });
  const credentialsValid = await verifyPassword(
    password,
    user?.passwordHash ?? dummyPasswordHash,
  );

  if (!user || !credentialsValid) {
    recordLoginFailure(email, clientIp);
    return loginFailure(request, "invalid_credentials", "Invalid credentials.", 401);
  }

  recordLoginSuccess(email, clientIp);
  await createSessionCookie({
    userId: user.id,
    passwordHash: user.passwordHash,
  });

  return NextResponse.redirect(new URL("/dashboard", request.url), {
    status: 303,
    headers: noStoreHeaders,
  });
}

function loginFailure(
  request: NextRequest,
  code: "invalid_credentials" | "invalid_request" | "rate_limited",
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  const headers = { ...noStoreHeaders, ...extraHeaders };
  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;

  if (acceptsHtml) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", code);
    return NextResponse.redirect(loginUrl, { status: 303, headers });
  }

  return NextResponse.json({ error: message }, { status, headers });
}
