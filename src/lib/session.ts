import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getPasswordVersion } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  getSessionCookieClearOptions,
  getSessionCookieName,
  getSessionCookieNamesToClear,
} from "@/lib/session-cookie";

const maxAgeSeconds = 60 * 60 * 24 * 7;

type SessionPayload = {
  v: 1;
  userId: string;
  passwordVersion: string;
  iat: number;
  exp: number;
};

type CreateSessionInput = {
  userId: string;
  passwordHash: string;
};

export async function createSessionCookie(input: CreateSessionInput) {
  const now = Math.floor(Date.now() / 1_000);
  const token = signSession({
    v: 1,
    userId: input.userId,
    passwordVersion: getPasswordVersion(input.passwordHash),
    iat: now,
    exp: now + maxAgeSeconds,
  });
  const cookieStore = await cookies();

  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();

  for (const name of getSessionCookieNamesToClear()) {
    // A __Host- cookie can only be overwritten (including expired) when the
    // clearing Set-Cookie keeps Secure and Path=/. cookies().delete() does not
    // preserve those attributes consistently, so browsers can reject it and
    // leave the authenticated session alive.
    cookieStore.set(name, "", getSessionCookieClearOptions(name));
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user || !safeEqual(payload.passwordVersion, getPasswordVersion(user.passwordHash))) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    exp: payload.exp,
  };
}

function signSession(payload: SessionPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createSignature(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = createSignature(encodedPayload);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const candidate = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SessionPayload>;
    const now = Math.floor(Date.now() / 1_000);

    if (
      candidate.v !== 1 ||
      typeof candidate.userId !== "string" ||
      !candidate.userId ||
      typeof candidate.passwordVersion !== "string" ||
      typeof candidate.iat !== "number" ||
      typeof candidate.exp !== "number" ||
      !Number.isSafeInteger(candidate.iat) ||
      !Number.isSafeInteger(candidate.exp) ||
      candidate.iat > now + 60 ||
      candidate.exp <= now ||
      candidate.exp - candidate.iat > maxAgeSeconds
    ) {
      return null;
    }

    return candidate as SessionPayload;
  } catch {
    return null;
  }
}

function createSignature(value: string) {
  return createHmac("sha256", getAuthSecret()).update(value).digest("base64url");
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();

  if (secret) {
    if (
      process.env.NODE_ENV === "production" &&
      (Buffer.byteLength(secret, "utf8") < 32 || /replace|change-me|example/i.test(secret))
    ) {
      throw new Error("AUTH_SECRET must be a random value of at least 32 bytes in production.");
    }

    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-change-me-dev-only-change-me";
  }

  throw new Error("AUTH_SECRET is required in production.");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
