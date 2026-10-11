// Kept in a small shared module so no authentication/server package enters the client.
export function safeReturnPath(
  value: string | null | undefined,
  fallback = "/",
) {
  if (
    !value ||
    value.length > 1500 ||
    !value.startsWith("/") ||
    value.startsWith("//")
  )
    return fallback;
  try {
    const url = new URL(value, "https://allting.invalid");
    if (
      url.origin !== "https://allting.invalid" ||
      /[\r\n\\]/.test(decodeURIComponent(value)) ||
      /^\/{2}/.test(decodeURIComponent(url.pathname))
    )
      return fallback;
    if (/^\/(?:api|konto|registrera)(?:\/|$)/.test(url.pathname))
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
export function loginPath(returnTo: string, action?: string) {
  const params = new URLSearchParams({ return_to: safeReturnPath(returnTo) });
  if (action) params.set("action", action);
  return `/konto?${params}`;
}
