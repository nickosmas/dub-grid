import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { keepPreviousDataForMobileIdentity, mobileQueryKeys } from "./mobile-query-keys";

function tokenFor(userId: string, orgId: string, issuedAt: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ sub: userId, org_id: orgId, iat: issuedAt }),
    "signature",
  ].join(".");
}

const RANGE = { startDate: "2026-09-06", endDate: "2026-09-12" };

describe("mobileQueryKeys", () => {
  const accountKeysFor = (token: string) => [
    mobileQueryKeys.orgStatus(token),
    mobileQueryKeys.profile(token),
    mobileQueryKeys.profileChangeRequests(token),
    mobileQueryKeys.adminProfileChangeRequests(token),
    mobileQueryKeys.profileSessions(token),
    mobileQueryKeys.notificationPreferences(token),
    mobileQueryKeys.notificationFacets(token),
    mobileQueryKeys.notifications(token, { filter: "unread", search: "shift", pageSize: 25 }),
    mobileQueryKeys.notificationDetail(token, "notification-1"),
    mobileQueryKeys.people(token),
    mobileQueryKeys.person(token, "person-1"),
    mobileQueryKeys.managementUsers(token),
  ];

  it("keeps every core read key stable across token rotation", () => {
    const first = tokenFor("user-1", "org-1", "first");
    const rotated = tokenFor("user-1", "org-1", "rotated");
    const keysFor = (token: string) => [
      mobileQueryKeys.dashboard(token, RANGE),
      mobileQueryKeys.dashboardSchedule(token),
      mobileQueryKeys.schedule(token, "mine", RANGE),
      mobileQueryKeys.schedule(token, "team", RANGE),
      mobileQueryKeys.shiftRequests(token, RANGE),
      mobileQueryKeys.shiftRequestHistory(token, 25),
      mobileQueryKeys.shiftRequestAvailability(token, RANGE),
      mobileQueryKeys.shiftSwapOptions(token, {
        ...RANGE,
        requesterEmpId: "employee-1",
        requesterShiftDate: RANGE.startDate,
      }),
    ];

    expect(keysFor(first)).toEqual(keysFor(rotated));
    expect(JSON.stringify(keysFor(first))).not.toContain(first);
    expect(JSON.stringify(keysFor(rotated))).not.toContain(rotated);
  });

  it("makes every core read key disjoint across user and organization changes", () => {
    const first = tokenFor("user-1", "org-1", "first");
    const otherUser = tokenFor("user-2", "org-1", "first");
    const otherOrg = tokenFor("user-1", "org-2", "first");
    const keysFor = (token: string) => [
      mobileQueryKeys.dashboard(token, RANGE),
      mobileQueryKeys.schedule(token, "mine", RANGE),
      mobileQueryKeys.shiftRequests(token, RANGE),
      mobileQueryKeys.shiftRequestHistory(token, 25),
    ];

    expect(keysFor(first)).not.toEqual(keysFor(otherUser));
    expect(keysFor(first)).not.toEqual(keysFor(otherOrg));
  });

  it("stabilizes account and directory reads across rotation without retaining the token", () => {
    const first = tokenFor("user-1", "org-1", "first");
    const rotated = tokenFor("user-1", "org-1", "rotated");

    expect(accountKeysFor(first)).toEqual(accountKeysFor(rotated));
    expect(JSON.stringify(accountKeysFor(first))).not.toContain(first);
    expect(JSON.stringify(accountKeysFor(rotated))).not.toContain(rotated);
  });

  it("isolates account and directory reads across user and organization changes", () => {
    const first = tokenFor("user-1", "org-1", "first");
    const otherUser = tokenFor("user-2", "org-1", "first");
    const otherOrg = tokenFor("user-1", "org-2", "first");

    expect(accountKeysFor(first)).not.toEqual(accountKeysFor(otherUser));
    expect(accountKeysFor(first)).not.toEqual(accountKeysFor(otherOrg));
  });

  it("preserves directory ids and notification filters, search, and pagination", () => {
    const token = tokenFor("user-1", "org-1", "first");

    expect(mobileQueryKeys.person(token, "person-17").at(-1)).toBe("person-17");
    expect(mobileQueryKeys.notificationDetail(token, "notification-9").at(-1)).toBe(
      "notification-9",
    );
    expect(
      mobileQueryKeys
        .notifications(token, {
          filter: "archived",
          search: "coverage",
          pageSize: 50,
        })
        .slice(-3),
    ).toEqual(["archived", "coverage", 50]);
  });

  it("preserves real range, scope, swap, and history parameters", () => {
    const token = tokenFor("user-1", "org-1", "first");

    const scheduleKey = mobileQueryKeys.schedule(token, "team", RANGE);
    expect(scheduleKey[2]).toBe("team");
    expect(scheduleKey.slice(-2)).toEqual([RANGE.startDate, RANGE.endDate]);
    expect(mobileQueryKeys.shiftRequestHistory(token, 50).at(-1)).toBe(50);
    expect(
      mobileQueryKeys
        .shiftSwapOptions(token, {
          ...RANGE,
          requesterEmpId: "employee-1",
          requesterShiftDate: "2026-09-07",
        })
        .slice(-4),
    ).toEqual(["employee-1", "2026-09-07", RANGE.startDate, RANGE.endDate]);
  });

  it("cancels the obsolete request when an observed identity changes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const first = tokenFor("user-1", "org-1", "first");
    const otherOrg = tokenFor("user-1", "org-2", "first");
    let obsoleteSignal: AbortSignal | undefined;
    const observer = new QueryObserver(queryClient, {
      queryKey: mobileQueryKeys.schedule(first, "mine", RANGE),
      queryFn: ({ signal }) => {
        obsoleteSignal = signal;
        return new Promise<{ entries: never[] }>(() => undefined);
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await vi.waitFor(() => expect(obsoleteSignal).toBeDefined());
    observer.setOptions({
      queryKey: mobileQueryKeys.schedule(otherOrg, "mine", RANGE),
      queryFn: async () => ({ entries: [] }),
    });

    await vi.waitFor(() => expect(obsoleteSignal?.aborted).toBe(true));
    unsubscribe();
    queryClient.clear();
  });
});

describe("keepPreviousDataForMobileIdentity", () => {
  it("retains ranged placeholder data only for the same user and organization", () => {
    const first = tokenFor("user-1", "org-1", "first");
    const rotated = tokenFor("user-1", "org-1", "rotated");
    const otherUser = tokenFor("user-2", "org-1", "first");
    const otherOrg = tokenFor("user-1", "org-2", "first");
    const previousData = { value: "safe" };
    const previousQuery = { queryKey: mobileQueryKeys.dashboard(first, RANGE) };

    expect(keepPreviousDataForMobileIdentity(rotated, previousData, previousQuery)).toBe(
      previousData,
    );
    expect(
      keepPreviousDataForMobileIdentity(otherUser, previousData, previousQuery),
    ).toBeUndefined();
    expect(
      keepPreviousDataForMobileIdentity(otherOrg, previousData, previousQuery),
    ).toBeUndefined();
    expect(
      keepPreviousDataForMobileIdentity("not-a-token", previousData, {
        queryKey: mobileQueryKeys.dashboard("another-bad-token", RANGE),
      }),
    ).toBeUndefined();
  });
});
