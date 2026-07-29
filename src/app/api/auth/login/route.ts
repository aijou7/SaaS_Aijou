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
import {
  getTrustedDeviceCookieName,
  verifyTrustedDeviceToken,
} from "@/lib/trusted-device";
import { isLoginOtpEnabled } from "@/lib/auth-flags";
import {
  AccountLifecycleError,
  sendLoginOtpForUser,
  sendVerificationEmailForUser,
} from "@/server/auth/account-lifecycle";
import { completeLogin } from "@/server/auth/login-completion";
import { isTransactionalEmailConfigured } from "@/server/email";

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
    try {
      const delivery = await sendVerificationEmailForUser(user.id, true);
      if (delivery.sent && delivery.challengeId) {
        await recordLoginSuccess(email, clientIp);
        if (!(request.headers.get("accept")?.includes("text/html") ?? false)) {
          return NextResponse.json(
            {
              requiresEmailVerification: true,
              challengeId: delivery.challengeId,
            },
            { status: 202, headers: noStoreHeaders },
          );
        }
        const verifyUrl = new URL("/verify-email", request.url);
        verifyUrl.searchParams.set("challenge", delivery.challengeId);
        verifyUrl.searchParams.set("sent", "1");
        return NextResponse.redirect(verifyUrl, {
          status: 303,
          headers: noStoreHeaders,
        });
      }
    } catch (error) {
      if (!(error instanceof AccountLifecycleError)) throw error;
    }
    return loginFailure(
      request,
      "email_unverified",
      "Email belum diverifikasi dan kode baru belum dapat dikirim.",
      403,
      {},
      nextPath,
    );
  }

  const trustedDevice = verifyTrustedDeviceToken(
    request.cookies.get(getTrustedDeviceCookieName())?.value,
    user,
  );
  if (
    !trustedDevice &&
    isLoginOtpEnabled() &&
    isTransactionalEmailConfigured()
  ) {
    try {
      const delivery = await sendLoginOtpForUser(user.id);
      if (!delivery.sent || !delivery.challengeId) {
        await recordLoginSuccess(email, clientIp);
        return loginFailure(
          request,
          "otp_delivery_failed",
          "Kode login belum dapat dikirim.",
          503,
          {},
          nextPath,
        );
      }
      await recordLoginSuccess(email, clientIp);
      if (!(request.headers.get("accept")?.includes("text/html") ?? false)) {
        return NextResponse.json(
          { requiresOtp: true, challengeId: delivery.challengeId },
          { status: 202, headers: noStoreHeaders },
        );
      }
      const verifyUrl = new URL("/login/verify", request.url);
      verifyUrl.searchParams.set("challenge", delivery.challengeId);
      if (nextPath) verifyUrl.searchParams.set("next", nextPath);
      return NextResponse.redirect(verifyUrl, {
        status: 303,
        headers: noStoreHeaders,
      });
    } catch (error) {
      await recordLoginSuccess(email, clientIp);
      return loginFailure(
        request,
        error instanceof AccountLifecycleError && error.code === "RATE_LIMITED"
          ? "otp_rate_limited"
          : "otp_delivery_failed",
        "Kode login belum dapat dikirim.",
        error instanceof AccountLifecycleError && error.code === "RATE_LIMITED" ? 429 : 503,
        {},
        nextPath,
      );
    }
  }

  const completion = await completeLogin(user, clientIp, false);
  if (!completion.completed) {
    return loginFailure(request, "invalid_credentials", "Invalid credentials.", 401, {}, nextPath);
  }
  const destination = completion.deletionCancelled
    ? "/dashboard?deletionCancelled=1"
    : nextPath ?? "/dashboard";
  return NextResponse.redirect(new URL(destination, request.url), {
    status: 303,
    headers: noStoreHeaders,
  });
}

function loginFailure(
  request: NextRequest,
  code:
    | "email_unverified"
    | "invalid_credentials"
    | "invalid_request"
    | "otp_delivery_failed"
    | "otp_rate_limited"
    | "rate_limited",
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
