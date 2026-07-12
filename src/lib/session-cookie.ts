const productionSessionCookieName = "__Host-aijou_session";
const developmentSessionCookieName = "aijou_session";
const legacySessionCookieName = "waa_session";

export function getSessionCookieName(environment = process.env.NODE_ENV) {
  return environment === "production"
    ? productionSessionCookieName
    : developmentSessionCookieName;
}

export function getSessionCookieNamesToClear(environment = process.env.NODE_ENV) {
  return new Set([
    getSessionCookieName(environment),
    developmentSessionCookieName,
    productionSessionCookieName,
    legacySessionCookieName,
  ]);
}

export function getSessionCookieClearOptions(
  cookieName: string,
  environment = process.env.NODE_ENV,
) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      environment === "production" || cookieName === productionSessionCookieName,
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  };
}
