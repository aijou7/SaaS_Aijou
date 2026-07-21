import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/abuse-guard";
import {
  recordLoginSuccess,
  reserveLoginAttempt,
} from "@/lib/durable-login-guard";
import { prisma } from "@/lib/prisma";
import { dummyPasswordHash, verifyPassword } from "@/lib/password";
import { getSafeInternalRedirectPath } from "@/lib/safe-navigation";
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
  const nextPath = getSafeInternalRedirectPath(formData.get("next"));

  if (!email || !email.includes("@") || email.length > 254 || !password || password.length > 128) {
    return loginFailure(
      request,
      "invalid_credentials",
      "Email atau password tidak valid.",
      400,
      {},
      nextPath,
    );
  }

  const clientIp = getClientIp(request);
  const loginLimit = await reserveLoginAttempt(email, clientIp);

  if (!loginLimit.allowed) {
    return loginFailure(
      request,
      "rate_limited",
      "Terlalu banyak percobaan login. Coba lagi sebentar.",
      429,
      { "Retry-After": String(loginLimit.retryAfterSeconds) },
      nextPath,
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      emailVerifiedAt: true,
      passwordHash: true,
      status: true,
    },
  });
  const credentialsValid = await verifyPassword(
    password,
    user?.passwordHash ?? dummyPasswordHash,
  );

  if (
    !user ||
    !credentialsValid ||
    (user.status !== "ACTIVE" && user.status !== "DELETION_PENDING")
  ) {
    return loginFailure(request, "invalid_credentials", "Invalid credentials.", 401, {}, nextPath);
  }

  // Only reveal the verification state after the password has been proven.
  // This keeps email enumeration closed while giving the legitimate owner a
  // useful recovery path instead of pretending that a correct password failed.
  if (!user.emailVerifiedAt) {
    return loginFailure(
      request,
      "email_unverified",
      "Email belum diverifikasi.",
      403,
      {},
      nextPath,
    );
  }

  const deletionCancelled = user.status === "DELETION_PENDING";
  const now = new Date();
  const activated = await prisma.user.updateMany({
    where: {
      id: user.id,
      passwordHash: user.passwordHash,
      status: user.status,
    },
    data: {
      lastLoginAt: now,
      lastSeenAt: now,
      ...(deletionCancelled
        ? { status: "ACTIVE", deletionRequestedAt: null }
        : {}),
    },
  });
  if (activated.count !== 1) {
    return loginFailure(request, "invalid_credentials", "Invalid credentials.", 401, {}, nextPath);
  }

  await recordLoginSuccess(email, clientIp);
  await createSessionCookie({
    userId: user.id,
    passwordHash: user.passwordHash,
  });

  const destination = deletionCancelled ? "/dashboard?deletionCancelled=1" : nextPath ?? "/dashboard";
  return NextResponse.redirect(new URL(destination, request.url), {
    status: 303,
    headers: noStoreHeaders,
  });
}

function loginFailure(
  request: NextRequest,
  code: "email_unverified" | "invalid_credentials" | "invalid_request" | "rate_limited",
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {},
  nextPath: string | null = null,
) {
  const headers = { ...noStoreHeaders, ...extraHeaders };
  const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;

  if (acceptsHtml) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", code);
    if (nextPath) loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl, { status: 303, headers });
  }

  return NextResponse.json({ error: message }, { status, headers });
}
