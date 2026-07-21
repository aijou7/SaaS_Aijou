const obviousPlaceholder =
  /(?:replace|change[\s_-]*me|dev[\s_-]*only|example|minimum[\s_-]*32|random[\s_-]*minimum|your[\s_-]*(?:key|secret|token)|secret[\s_-]*(?:here|value))/i;

export function isStrongRuntimeSecret(
  value: string | null | undefined,
): value is string {
  const secret = value?.trim() ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32 || obviousPlaceholder.test(secret)) {
    return false;
  }

  // Length alone still accepts values such as "a" repeated 32 times. This is
  // deliberately a lightweight configuration guard, not an entropy oracle.
  return new Set(secret).size >= 12;
}

export function getConfiguredRuntimeSecret(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (process.env.NODE_ENV !== "production") return value || null;
  return isStrongRuntimeSecret(value) ? value : null;
}

export function areCriticalRuntimeSecretsReady(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  production = process.env.NODE_ENV === "production",
) {
  if (!production) return true;

  const auth = environment.AUTH_SECRET?.trim();
  const widget = environment.WIDGET_SIGNING_SECRET?.trim();
  const cron = environment.CRON_SECRET?.trim();
  const values = [auth, widget, cron];

  return (
    values.every(isStrongRuntimeSecret) &&
    new Set(values).size === values.length
  );
}
