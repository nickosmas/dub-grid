import type { QueryClient } from "@tanstack/react-query";

export type MobileRealtimeTable =
  | "organizations"
  | "focus_areas"
  | "shift_categories"
  | "jobs"
  | "absence_types"
  | "coverage_requirements"
  | "departments"
  | "certifications"
  | "organization_roles"
  | "organization_memberships"
  | "subscriptions"
  | "invitations"
  | "indicator_types"
  | "employees"
  | "shift_requests"
  | "schedule_cells"
  | "schedule_cell_snapshots"
  | "schedule_cell_segments"
  | "schedule_notes";

export function getMobileRealtimeInvalidationKeys(
  accessToken: string,
  table: MobileRealtimeTable,
): readonly (readonly unknown[])[] {
  const bootstrap = ["mobile", "bootstrap", accessToken] as const;
  const profile = ["mobile", "profile", accessToken] as const;
  const people = ["mobile", "people", accessToken] as const;
  const schedule = ["mobile", "schedule"] as const;
  const requests = ["mobile", "requests"] as const;

  switch (table) {
    case "organizations":
    case "focus_areas":
    case "shift_categories":
    case "jobs":
    case "absence_types":
    case "coverage_requirements":
    case "departments":
    case "certifications":
    case "organization_roles":
    case "indicator_types":
      return [bootstrap, profile, schedule, requests];
    case "organization_memberships":
    case "subscriptions":
    case "invitations":
      return [bootstrap, profile, people];
    case "employees":
      return [bootstrap, profile, people, schedule, requests];
    case "shift_requests":
      return [requests, schedule];
    case "schedule_cells":
    case "schedule_cell_snapshots":
    case "schedule_cell_segments":
      return [schedule, requests];
    case "schedule_notes":
      return [schedule];
  }
}

export function invalidateMobileRealtimeQueries(
  queryClient: QueryClient,
  accessToken: string,
  table: MobileRealtimeTable,
): void {
  for (const queryKey of getMobileRealtimeInvalidationKeys(accessToken, table)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
