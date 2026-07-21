const internalOrigin = "https://aijou.internal";

export function getSafeInternalRedirectPath(value: unknown) {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (
    !candidate ||
    candidate.length > 2_048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return null;
  }

  try {
    const url = new URL(candidate, internalOrigin);
    if (url.origin !== internalOrigin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
