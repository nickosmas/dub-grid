import { describe, expect, it, vi } from "vitest";
import {
  loadMobileBootstrapPayload,
  loadMobileMeSchedulePayload,
  loadMobileOrgSchedulePayload,
  loadMobilePeoplePayload,
} from "./read";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

describe("loadMobileBootstrapPayload", () => {
  it("preserves role certification requirements in the authenticated bootstrap payload", async () => {
    const fetchMobileRoles = vi.fn(async () => [
      {
        id: 3,
        name: "Clinical Lead",
        abbr: "CL",
        requiredCertificationIds: [8, 9],
      },
    ]);

    const payload = await loadMobileBootstrapPayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        userClient: {},
        user: { id: USER_ID, email: "alex@example.com" },
        memberships: [],
        permissions: { role: "admin", canManageUsers: true },
      } as never,
      {
        fetchLinkedEmployeeForUser: vi.fn(async () => null),
        fetchMobileUnreadNotificationCount: vi.fn(async () => 0),
        fetchMobileAbsenceTypes: vi.fn(async () => []),
        fetchMobileFocusAreas: vi.fn(async () => []),
        fetchMobileRoles,
        fetchMobileCertifications: vi.fn(async () => []),
        fetchMobileDepartments: vi.fn(async () => []),
        fetchTermsAcceptedVersion: vi.fn(async () => null),
        mapOrganizationToMobileConfig: vi.fn(() => ({ id: ORG_ID })),
      } as never,
    );

    expect(fetchMobileRoles).toHaveBeenCalledWith({}, ORG_ID);
    expect(payload.roles).toEqual([
      {
        id: 3,
        name: "Clinical Lead",
        abbr: "CL",
        requiredCertificationIds: [8, 9],
      },
    ]);
  });
});

describe("loadMobilePeoplePayload", () => {
  const makePerson = (overrides: Record<string, unknown>) => ({
    id: "employee-1",
    employeeNumber: 1,
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "555-0100",
    email: "mina@example.com",
    status: "active",
    orgRole: null,
    certificationId: 7,
    roleIds: [9],
    seniority: 1,
    focusAreaIds: [2],
    departmentIds: [4],
    deptAdminIds: [4],
    managementDepartmentIds: [],
    managementDeptAdminIds: [],
    contactNotes: "Private note",
    statusChangedAt: null,
    statusNote: "Private status",
    userId: null,
    version: 1,
    membershipUpdatedAt: null,
    pendingInvitation: null,
    ...overrides,
  });

  it("excludes self before returning a redacted regular-user directory", async () => {
    const self = makePerson({ id: "employee-self", userId: USER_ID });
    const coworker = makePerson({ id: "employee-coworker", userId: "another-user" });
    const inactive = makePerson({ id: "employee-inactive", status: "inactive" });

    const payload = await loadMobilePeoplePayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        user: { id: USER_ID },
        permissions: {
          canManageEmployees: false,
          canViewStaff: true,
          canViewEmployeeDetails: false,
        },
      } as never,
      {
        fetchMobilePeople: vi.fn(async () => [self, coworker, inactive]),
        mapEmployeeToMobilePerson: vi.fn((person) => person),
      } as never,
    );

    expect(payload.people).toHaveLength(1);
    expect(payload.people[0]).toMatchObject({
      id: "employee-coworker",
      certificationId: 7,
      focusAreaIds: [2],
      roleIds: [9],
      email: "",
      phone: "",
      contactNotes: "",
      departmentIds: [],
      deptAdminIds: [],
      statusNote: "",
      userId: null,
    });
  });

  it("keeps administrator directory data unchanged", async () => {
    const self = makePerson({ id: "employee-self", userId: USER_ID });

    const payload = await loadMobilePeoplePayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        user: { id: USER_ID },
        permissions: {
          canManageEmployees: true,
          canViewStaff: true,
          canViewEmployeeDetails: true,
        },
      } as never,
      {
        fetchMobilePeople: vi.fn(async () => [self]),
        mapEmployeeToMobilePerson: vi.fn((person) => person),
      } as never,
    );

    expect(payload.people).toEqual([self]);
  });

  it("hands contact details to a view-only admin, matching the web People table", async () => {
    const coworker = makePerson({ id: "employee-coworker", userId: "user-coworker" });

    const payload = await loadMobilePeoplePayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        user: { id: USER_ID },
        // Granted "View employee details" without staff management: web shows
        // them contact details, so mobile must not blank them.
        permissions: {
          canManageEmployees: false,
          canViewStaff: true,
          canViewEmployeeDetails: true,
        },
      } as never,
      {
        fetchMobilePeople: vi.fn(async () => [coworker]),
        mapEmployeeToMobilePerson: vi.fn((person) => person),
      } as never,
    );

    expect(payload.people[0]).toMatchObject({
      email: coworker.email,
      phone: coworker.phone,
    });
  });
});

describe("schedule payloads and the publisher's name", () => {
  const entry = (publishedByName: string | null) =>
    ({
      employeeId: "employee-1",
      employeeName: "Mina Diaz",
      date: "2026-09-21",
      state: null,
      presentation: null,
      change: null,
      publishedAt: "2026-09-18T03:31:00Z",
      publishedByName,
    }) as never;
  const range = { startDate: "2026-09-20", endDate: "2026-09-26" };
  const fetchMobileScheduleEntries = vi.fn(async () => [entry("Nic Kosmas"), entry(null)]);
  const fetchLinkedEmployeeForUser = vi.fn(async () => ({
    id: "employee-9",
    firstName: "Alex",
    lastName: "Reed",
    status: "active",
    focusAreaIds: [],
    departmentIds: [],
  }));

  it("withholds who published from a viewer who cannot publish, keeping the time", async () => {
    const payload = await loadMobileMeSchedulePayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        user: { id: USER_ID },
        permissions: { canPublishSchedule: false, level: 0 },
      } as never,
      range,
      { fetchLinkedEmployeeForUser, fetchMobileScheduleEntries } as never,
    );
    expect(payload.entries.map((item) => item.publishedByName)).toEqual([null, null]);
    expect(payload.entries[0]!.publishedAt).toBe("2026-09-18T03:31:00Z");
  });

  it("keeps the publisher for a publisher and for a super admin", async () => {
    const publisher = await loadMobileOrgSchedulePayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        permissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canApproveShiftRequests: false,
          canManageEmployees: false,
          canPublishSchedule: true,
          level: 2,
        },
      } as never,
      range,
      { fetchMobileScheduleEntries } as never,
    );
    expect(publisher.entries[0]!.publishedByName).toBe("Nic Kosmas");

    const superAdmin = await loadMobileOrgSchedulePayload(
      {
        currentOrg: { id: ORG_ID },
        serviceClient: {},
        permissions: {
          canViewSchedule: true,
          canEditShifts: true,
          canApproveShiftRequests: true,
          canManageEmployees: true,
          canPublishSchedule: false,
          level: 3,
        },
      } as never,
      range,
      { fetchMobileScheduleEntries } as never,
    );
    expect(superAdmin.entries[0]!.publishedByName).toBe("Nic Kosmas");
  });
});
