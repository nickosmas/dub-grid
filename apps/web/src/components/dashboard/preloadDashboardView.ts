/**
 * Starts downloading the dashboard's code. Kept apart from the page so the
 * sign-in form can call it without bundling the page's own imports.
 */
export function preloadDashboardView(): void {
  void import("@/components/dashboard/DashboardView").catch(() => {});
}
