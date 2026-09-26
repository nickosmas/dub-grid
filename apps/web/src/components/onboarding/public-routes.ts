/** Routes the app's gates (onboarding, two-factor re-enrollment) never intercept. */
const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/goodbye",
  "/accept-invite",
  "/accept-terms",
  "/auth",
  "/api",
  "/terms",
  "/privacy",
  "/cookie-policy",
  "/onboarding",
  // The organization gate in the proxy is terminal: a member held there has no
  // organization to be onboarded into yet. Without this the wizard painted
  // straight over the screen explaining the wait, and finishing it dropped the
  // user back on that same screen. Bootstrap is the other reason: it answers a
  // locked organization with a 403, which reads here as a failed bootstrap and
  // covers the gate with the recovery screen instead.
  "/billing-required",
  "/forgot-password",
  "/reset-password",
  "/request-demo",
];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"));
}
