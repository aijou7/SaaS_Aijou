import { cookies } from "next/headers";

const productionWorkspaceCookieName = "__Host-aijou_workspace";
const developmentWorkspaceCookieName = "aijou_workspace";
const legacyWorkspaceCookieName = "waa_workspace";
const maxAgeSeconds = 60 * 60 * 24 * 365;

export function getWorkspaceCookieName(environment = process.env.NODE_ENV) {
  return environment === "production"
    ? productionWorkspaceCookieName
    : developmentWorkspaceCookieName;
}

export async function getActiveWorkspaceId() {
  const value = (await cookies()).get(getWorkspaceCookieName())?.value?.trim() ?? "";
  return /^[A-Za-z0-9_-]{10,64}$/.test(value) ? value : null;
}

export async function setActiveWorkspaceCookie(businessId: string) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(businessId)) {
    throw new Error("Workspace tidak valid.");
  }

  (await cookies()).set(getWorkspaceCookieName(), businessId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearActiveWorkspaceCookie() {
  const cookieStore = await cookies();
  for (const name of new Set([
    getWorkspaceCookieName(),
    productionWorkspaceCookieName,
    developmentWorkspaceCookieName,
    legacyWorkspaceCookieName,
  ])) {
    cookieStore.set(name, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" || name === productionWorkspaceCookieName,
      path: "/",
      expires: new Date(0),
      maxAge: 0,
    });
  }
}
