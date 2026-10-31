/**
 * Starts downloading the dashboard's code, and the app shell around it, which
 * the sign-in pages leave out. Kept apart from the page so the sign-in form can
 * call it without bundling the page's own imports.
 */
export function preloadDashboardView(): void {
  void import("@/components/dashboard/DashboardView").catch(() => {});
  void import("@/components/AppShellProviders").catch(() => {});
}
