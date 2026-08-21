/**
 * Routes that are useful to a signed-in user or internal workflow but should
 * never be advertised to search engines as landing pages.
 *
 * Keep this list shared by the sitemap and middleware so a URL cannot be
 * marked noindex while still being presented as important in sitemap.xml.
 */
export const NON_INDEXABLE_PATH_PREFIXES = [
  "/admin",
  "/agent",
  "/ai-jobs",
  "/applications",
  "/auth",
  "/checkout",
  "/dashboard",
  "/delete-account",
  "/email/unsubscribe",
  "/extension/connect",
  "/first-apply",
  "/jobs",
  "/login",
  "/logo-lab",
  "/onboarding",
  "/profiles",
  "/settings",
  "/swipe-apply",
  "/variants",
] as const;

export function isNonIndexablePath(pathname: string) {
  const normalized = pathname !== "/" ? pathname.replace(/\/+$/, "") : pathname;
  return NON_INDEXABLE_PATH_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}
