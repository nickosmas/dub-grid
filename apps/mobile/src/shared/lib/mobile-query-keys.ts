import type { MobileScheduleRange } from "@dubgrid/contracts";
import { getMobileAuthIdentityKey, type MobileAuthIdentityKey } from "./access-token";

type ScheduleScope = "mine" | "team";

export const mobileQueryKeys = {
  orgStatus: (accessToken: string | null) =>
    ["mobile", "org-status", getMobileAuthIdentityKey(accessToken)] as const,
  profile: (accessToken: string | null) =>
    ["mobile", "profile", getMobileAuthIdentityKey(accessToken)] as const,
  profileChangeRequests: (accessToken: string | null) =>
    ["mobile", "profile", "change-requests", getMobileAuthIdentityKey(accessToken)] as const,
  adminProfileChangeRequests: (accessToken: string | null) =>
    ["mobile", "profile-change-requests", "admin", getMobileAuthIdentityKey(accessToken)] as const,
  profileSessions: (accessToken: string | null) =>
    ["mobile", "profile", "sessions", getMobileAuthIdentityKey(accessToken)] as const,
  calendarSubscription: (accessToken: string | null) =>
    ["mobile", "profile", "calendar-subscription", getMobileAuthIdentityKey(accessToken)] as const,
  notificationPreferences: (accessToken: string | null) =>
    ["mobile", "notification-preferences", getMobileAuthIdentityKey(accessToken)] as const,
  notificationFacets: (accessToken: string | null) =>
    ["mobile", "notification-facets", getMobileAuthIdentityKey(accessToken)] as const,
  notificationsPrefix: (accessToken: string | null) =>
    ["mobile", "notifications-infinite", getMobileAuthIdentityKey(accessToken)] as const,
  notifications: (
    accessToken: string | null,
    params: { filter: string; search: string; pageSize: number },
  ) =>
    [
      ...mobileQueryKeys.notificationsPrefix(accessToken),
      params.filter,
      params.search,
      params.pageSize,
    ] as const,
  notificationDetail: (accessToken: string | null, notificationId: string | null) =>
    [
      "mobile",
      "notification-detail",
      getMobileAuthIdentityKey(accessToken),
      notificationId,
    ] as const,
  notificationDetailPrefix: (accessToken: string | null) =>
    ["mobile", "notification-detail", getMobileAuthIdentityKey(accessToken)] as const,
  people: (accessToken: string | null) =>
    ["mobile", "people", getMobileAuthIdentityKey(accessToken)] as const,
  personPrefix: (accessToken: string | null) =>
    ["mobile", "person", getMobileAuthIdentityKey(accessToken)] as const,
  person: (accessToken: string | null, personId: string | undefined | null) =>
    [...mobileQueryKeys.personPrefix(accessToken), personId] as const,
  managementUsers: (accessToken: string | null) =>
    ["mobile", "management-users", getMobileAuthIdentityKey(accessToken)] as const,
  dashboard: (accessToken: string | null, range?: MobileScheduleRange) =>
    [
      "mobile",
      "dashboard",
      getMobileAuthIdentityKey(accessToken),
      range?.startDate,
      range?.endDate,
    ] as const,
  dashboardSchedule: (accessToken: string | null, range?: MobileScheduleRange) =>
    [
      "mobile",
      "dashboard",
      "my-schedule",
      getMobileAuthIdentityKey(accessToken),
      range?.startDate,
      range?.endDate,
    ] as const,
  schedule: (accessToken: string | null, scope: ScheduleScope, range: MobileScheduleRange) =>
    [
      "mobile",
      "schedule",
      scope,
      getMobileAuthIdentityKey(accessToken),
      range.startDate,
      range.endDate,
    ] as const,
  shiftRequests: (accessToken: string | null, range: MobileScheduleRange) =>
    [
      "mobile",
      "requests",
      getMobileAuthIdentityKey(accessToken),
      range.startDate,
      range.endDate,
    ] as const,
  shiftRequestHistory: (accessToken: string | null, pageSize: number) =>
    ["mobile", "requests", "history", getMobileAuthIdentityKey(accessToken), pageSize] as const,
  shiftRequestAvailability: (accessToken: string | null, range: MobileScheduleRange) =>
    [
      "mobile",
      "requests",
      "availability",
      getMobileAuthIdentityKey(accessToken),
      range.startDate,
      range.endDate,
    ] as const,
  shiftSwapOptions: (
    accessToken: string | null,
    input: MobileScheduleRange & {
      requesterEmpId: string | null;
      requesterShiftDate: string | null;
    },
  ) =>
    [
      "mobile",
      "shift-swap-options",
      getMobileAuthIdentityKey(accessToken),
      input.requesterEmpId,
      input.requesterShiftDate,
      input.startDate,
      input.endDate,
    ] as const,
};

function isSameIdentityKey(left: unknown, right: MobileAuthIdentityKey): boolean {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((segment, index) => segment === right[index])
  );
}

export function keepPreviousDataForMobileIdentity<T>(
  accessToken: string | null,
  previousData: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
): T | undefined {
  const identity = getMobileAuthIdentityKey(accessToken);
  if (identity[0] !== "authenticated") {
    return undefined;
  }

  return previousQuery?.queryKey.some((segment) => isSameIdentityKey(segment, identity))
    ? previousData
    : undefined;
}
