export const DEFAULT_POST_LOGIN_DESTINATION = "/(tabs)/home";

// The auth screens by the public pathnames `usePathname` reports for them.
// Returning to one after sign-in would strand the user on a signed-out screen.
const AUTH_SCREEN_PATHS = new Set([
  "/",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
]);

/**
 * Where to go after sign-in. Only an in-app path may steer it: a protected
 * route sends its own pathname along as `next` when it bounces a signed-out
 * visitor to login, and anything else falls back to the Home tab.
 */
export function resolvePostLoginDestination(next: unknown): string {
  if (typeof next !== "string") return DEFAULT_POST_LOGIN_DESTINATION;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return DEFAULT_POST_LOGIN_DESTINATION;
  }
  const path = trimmed.split(/[?#]/, 1)[0].replace(/^\/\([^/]+\)/, "") || "/";
  if (AUTH_SCREEN_PATHS.has(path)) return DEFAULT_POST_LOGIN_DESTINATION;
  return trimmed;
}
