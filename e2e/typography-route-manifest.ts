export type TypographyRouteAuditEntry = {
  route: string;
  visit: string;
  origin: "apex" | "organization";
  access: "public" | "authenticated" | "gridmaster" | "redirect";
  source: string;
  browserExpectation: "rendered" | "login-redirect" | "route-redirect";
  expectedPath?: string;
  browserStates: readonly string[];
  sourceReviewedStates: readonly string[];
};

export const typographyRouteAuditManifest = [
  {
    route: "/",
    visit: "/",
    origin: "apex",
    access: "public",
    source: "apps/web/src/app/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["landing", "responsive navigation"],
    sourceReviewedStates: [],
  },
  {
    route: "/login",
    visit: "/login",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/login/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["form"],
    sourceReviewedStates: ["loading", "inline error"],
  },
  {
    route: "/forgot-password",
    visit: "/forgot-password",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/forgot-password/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["form"],
    sourceReviewedStates: ["success", "loading"],
  },
  {
    route: "/reset-password",
    visit: "/reset-password?error=invalid_link",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/reset-password/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["invalid-link"],
    sourceReviewedStates: ["form", "success", "loading"],
  },
  {
    route: "/verify-email",
    visit: "/verify-email",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/verify-email/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["instructions"],
    sourceReviewedStates: ["resend cooldown", "loading"],
  },
  {
    route: "/auth/verify",
    visit: "/auth/verify",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/auth/verify/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["invalid-link"],
    sourceReviewedStates: ["confirmation", "loading", "error"],
  },
  {
    route: "/accept-invite",
    visit: "/accept-invite",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/accept-invite/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["missing-token"],
    sourceReviewedStates: ["form", "processing", "success", "error"],
  },
  {
    route: "/accept-terms",
    visit: "/accept-terms",
    origin: "organization",
    access: "redirect",
    source: "apps/web/src/app/(app)/accept-terms/page.tsx",
    browserExpectation: "login-redirect",
    expectedPath: "/login",
    browserStates: ["authentication gate"],
    sourceReviewedStates: ["acceptance card", "loading"],
  },
  {
    route: "/onboarding",
    visit: "/onboarding",
    origin: "organization",
    access: "redirect",
    source: "apps/web/src/app/(app)/onboarding/page.tsx",
    browserExpectation: "login-redirect",
    expectedPath: "/login",
    browserStates: ["authentication gate"],
    sourceReviewedStates: ["pending assignment", "loading", "timeout"],
  },
  {
    route: "/billing-required",
    visit: "/billing-required",
    origin: "organization",
    access: "redirect",
    source: "apps/web/src/app/(app)/billing-required/page.tsx",
    browserExpectation: "login-redirect",
    expectedPath: "/login",
    browserStates: ["login redirect"],
    sourceReviewedStates: ["billing gate", "organization unavailable"],
  },
  {
    route: "/goodbye",
    visit: "/goodbye",
    origin: "organization",
    access: "public",
    source: "apps/web/src/app/(app)/goodbye/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["signed out"],
    sourceReviewedStates: ["inactivity"],
  },
  {
    route: "/request-demo",
    visit: "/request-demo",
    origin: "apex",
    access: "public",
    source: "apps/web/src/app/request-demo/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["form"],
    sourceReviewedStates: ["success", "validation error"],
  },
  {
    route: "/privacy",
    visit: "/privacy",
    origin: "apex",
    access: "public",
    source: "apps/web/src/app/privacy/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["policy"],
    sourceReviewedStates: [],
  },
  {
    route: "/terms",
    visit: "/terms",
    origin: "apex",
    access: "public",
    source: "apps/web/src/app/terms/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["policy"],
    sourceReviewedStates: [],
  },
  {
    route: "/cookie-policy",
    visit: "/cookie-policy",
    origin: "apex",
    access: "public",
    source: "apps/web/src/app/cookie-policy/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["policy"],
    sourceReviewedStates: [],
  },
  {
    route: "/dashboard",
    visit: "/dashboard",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/dashboard/page.tsx",
    browserExpectation: "rendered",
    // "loading", "empty cards", and "trial overlay": e2e/dashboard-states.spec.ts.
    // "error": e2e/auth-degraded-network-recovery.spec.ts's "Calm Haven cold
    // bootstrap recovers in place after exhausted 503 responses" (asserts
    // OrganizationBootstrapRecovery's rendered UI on this route).
    browserStates: ["dashboard", "loading", "error", "empty cards", "trial overlay"],
    sourceReviewedStates: [],
  },
  {
    route: "/gridmaster",
    visit: "/gridmaster",
    origin: "organization",
    access: "gridmaster",
    source: "apps/web/src/app/(app)/gridmaster/page.tsx",
    browserExpectation: "route-redirect",
    expectedPath: "/schedule",
    browserStates: ["authorization gate"],
    sourceReviewedStates: ["portal", "loading", "error", "not found"],
  },
  {
    route: "/schedule",
    visit: "/schedule",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/schedule/page.tsx",
    browserExpectation: "rendered",
    // error.tsx and not-found.tsx exist for route-convention consistency but
    // are not currently reachable: SchedulePageClient.tsx has no throw
    // statement anywhere (every failure path is a caught toast.error, 59
    // call sites checked) and no file under app/(app)/schedule/ calls
    // notFound(). Not evidenced states, since there is nothing to trigger.
    // "loading" and "dialogs": e2e/schedule-states.spec.ts.
    browserStates: ["grid", "toolbar", "loading", "dialogs"],
    sourceReviewedStates: [],
  },
  {
    route: "/people",
    visit: "/people",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/people/page.tsx",
    browserExpectation: "rendered",
    // "not found", "loading", "error", "drawers", and "dialogs":
    // e2e/people-states.spec.ts ("not found" via the shared not-found.tsx
    // boundary, triggered through /people/[id] with a malformed id).
    browserStates: ["directory", "table", "not found", "loading", "error", "drawers", "dialogs"],
    sourceReviewedStates: [],
  },
  {
    route: "/people/[id]",
    visit: "/people/[id]",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/people/[id]/page.tsx",
    browserExpectation: "rendered",
    // "not found", "loading", and "dialogs": e2e/people-states.spec.ts.
    // "error" was checked (StaffDetailPage.tsx read in full, 1109 lines):
    // every failure path, including the one throw statement (:429), is
    // caught locally and shown via toast.error - none reach the shared
    // people/error.tsx boundary, so there is nothing to trigger.
    browserStates: ["detail", "not found", "loading", "dialogs"],
    sourceReviewedStates: [],
  },
  {
    route: "/profile",
    visit: "/profile",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/profile/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["overview"],
    sourceReviewedStates: ["lazy panels", "loading", "error"],
  },
  {
    route: "/reports",
    visit: "/reports",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/reports/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["report builder", "tables"],
    sourceReviewedStates: ["loading", "error", "empty", "popovers"],
  },
  {
    route: "/alerts",
    visit: "/alerts",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/alerts/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["inbox"],
    sourceReviewedStates: ["loading", "error", "empty"],
  },
  {
    route: "/account",
    visit: "/account",
    origin: "organization",
    access: "redirect",
    source: "apps/web/src/app/(app)/account/page.tsx",
    browserExpectation: "route-redirect",
    expectedPath: "/profile",
    browserStates: ["profile redirect"],
    sourceReviewedStates: [],
  },
  {
    route: "/settings",
    visit: "/settings",
    origin: "organization",
    access: "authenticated",
    source: "apps/web/src/app/(app)/settings/page.tsx",
    browserExpectation: "rendered",
    browserStates: ["all lazy panels", "tables"],
    sourceReviewedStates: ["loading", "error", "not found", "dialogs"],
  },
  {
    route: "/settings/staff-config",
    visit: "/settings/staff-config",
    origin: "organization",
    access: "redirect",
    source: "apps/web/src/app/(app)/settings/staff-config/page.tsx",
    browserExpectation: "route-redirect",
    expectedPath: "/settings",
    browserStates: ["staff certifications redirect"],
    sourceReviewedStates: [],
  },
] as const satisfies readonly TypographyRouteAuditEntry[];

export const settingsPanelAuditManifest = [
  {
    id: "org-general",
    source: "apps/web/src/components/settings/OrganizationGeneral.tsx",
  },
  {
    id: "org-billing",
    source: "apps/web/src/components/settings/BillingSettings.tsx",
  },
  {
    id: "org-labels",
    source: "apps/web/src/components/settings/OrganizationLabels.tsx",
  },
  {
    id: "org-activity",
    source: "apps/web/src/components/settings/ActivityLog.tsx",
  },
  {
    id: "org-display",
    source: "apps/web/src/components/settings/DisplayMode.tsx",
  },
  {
    id: "schedule-rules",
    source: "apps/web/src/components/settings/ScheduleRules.tsx",
  },
  {
    id: "schedule-shifts",
    source: "apps/web/src/components/settings/ShiftCategories.tsx",
  },
  {
    id: "schedule-jobs",
    source: "apps/web/src/components/settings/Jobs.tsx",
  },
  {
    id: "schedule-absence-types",
    source: "apps/web/src/components/settings/AbsenceTypes.tsx",
  },
  {
    id: "schedule-coverage",
    source: "apps/web/src/components/settings/Coverage.tsx",
  },
  {
    id: "staff-certifications",
    source: "apps/web/src/components/settings/StringListSettings.tsx",
  },
  {
    id: "staff-roles",
    source: "apps/web/src/components/settings/StringListSettings.tsx",
  },
  {
    id: "staff-departments",
    source: "apps/web/src/components/settings/DepartmentsSettings.tsx",
  },
  {
    id: "staff-indicators",
    source: "apps/web/src/components/settings/Indicators.tsx",
  },
  {
    id: "org-danger",
    source: "apps/web/src/components/settings/DangerZone.tsx",
  },
] as const;
