import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getPasswordVersion } from "@/lib/password";
import { getAuthSecret } from "@/lib/session";

const trustedDeviceMaxAgeSeconds = 60 * 60 * 24 * 30;
const productionCookieName = "__Host-aijou_trusted_device";
const developmentCookieName = "aijou_trusted_device";

type TrustedDevicePayload = {
  v: 1;
  userId: string;
  passwordVersion: string;
  iat: number;
  exp: number;
};

export function getTrustedDeviceCookieName(environment = process.env.NODE_ENV) {
  return environment === "production" ? productionCookieName : developmentCookieName;
}

export function verifyTrustedDeviceToken(
  token: string | undefined,
  user: { id: string; passwordHash: string },
) {
  if (!token) return false;
  const [encodedPayload, signature, ...extra] = token.split(".");
  if (!encodedPayload || !signature || extra.length) return false;
  const expectedSignature = sign(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return false;

  try {
    const candidate = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<TrustedDevicePayload>;
    const now = Math.floor(Date.now() / 1_000);
    return (
      candidate.v === 1 &&
      candidate.userId === user.id &&
      candidate.passwordVersion === getPasswordVersion(user.passwordHash) &&
      typeof candidate.iat === "number" &&
      typeof candidate.exp === "number" &&
      Number.isSafeInteger(candidate.iat) &&
      Number.isSafeInteger(candidate.exp) &&
      candidate.iat <= now + 60 &&
      candidate.exp > now &&
      candidate.exp - candidate.iat <= trustedDeviceMaxAgeSeconds
    );
  } catch {
    return false;
  }
}

export async function createTrustedDeviceCookie(
  user: { id: string; passwordHash: string },
) {
  const now = Math.floor(Date.now() / 1_000);
  const payload: TrustedDevicePayload = {
    v: 1,
    userId: user.id,
    passwordVersion: getPasswordVersion(user.passwordHash),
    iat: now,
    exp: now + trustedDeviceMaxAgeSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encodedPayload}.${sign(encodedPayload)}`;
  const cookieStore = await cookies();
  cookieStore.set(getTrustedDeviceCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: trustedDeviceMaxAgeSeconds,
  });
}

function sign(value: string) {
  return createHmac("sha256", getAuthSecret())
    .update(`aijou-trusted-device\0${value}`)
    .digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
