// Shared by the login page and form. Only the application's protected page
// namespace can be a destination; never accept an arbitrary redirect URL.
export function getProtectedReturnTo(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || /[\\\s]/.test(value)) {
    return null;
  }
  try {
    const base = "http://reviewlens.invalid";
    const url = new URL(value, base);
    if (
      url.origin !== base ||
      (url.pathname !== "/analysis-targets" && !url.pathname.startsWith("/analysis-targets/"))
    ) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
