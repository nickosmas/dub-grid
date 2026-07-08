import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient, User } from "@supabase/supabase-js";

const cacheDel = vi.fn();
const deleteUserAccountWithCleanup = vi.fn();
const fetchLinkedEmployeeForUser = vi.fn();
const loggerError = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/cache", () => ({
  cacheDel: (...args: unknown[]) => cacheDel(...args),
  CacheKey: {
    employees: (orgId: string) => `employees:${orgId}`,
    orgDirectory: (orgId: string) => `org-directory:${orgId}`,
    tenantStats: () => "tenant-stats",
  },
}));

vi.mock("@/features/account/server/account-deletion", () => ({
  deleteUserAccountWithCleanup: (...args: unknown[]) => deleteUserAccountWithCleanup(...args),
}));

vi.mock("@/features/mobile/server", () => ({
  fetchLinkedEmployeeForUser: (...args: unknown[]) => fetchLinkedEmployeeForUser(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: (...args: unknown[]) => loggerError(...args),
  },
}));

import { createProfileChangeRequest, resolveProfileChangeRequest } from "./profile-change-requests";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const REQUESTER_USER_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";

function makeRequestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST_ID,
    org_id: ORG_ID,
    requester_user_id: REQUESTER_USER_ID,
    requester_employee_id: EMPLOYEE_ID,
    requester_employee_version: 7,
    requester_name: "Alex Old",
    requester_email: "alex@example.com",
    request_type: "profile_update",
    status: "pending",
    requested_changes: {
      firstName: "Alexandra",
      lastName: "Stone",
    },
    current_values: {
      firstName: "Alex",
      lastName: "Old",
      version: 7,
    },
    request_note: "Please update my legal name.",
    resolver_user_id: null,
    resolver_note: null,
    resolved_at: null,
    cancelled_at: null,
    created_at: "2026-05-01T15:00:00.000Z",
    updated_at: "2026-05-01T15:00:00.000Z",
    version: 2,
    ...overrides,
  };
}

function makeEmployeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE_ID,
    org_id: ORG_ID,
    first_name: "Alex",
    last_name: "Old",
    employment_type: "full_time",
    status: "active",
    status_changed_at: null,
    status_note: "",
    certification_id: null,
    role_ids: [],
    seniority: 1,
    focus_area_ids: [1],
    phone: "555-0100",
    email: "alex@example.com",
    contact_notes: "",
    archived_at: null,
    user_id: REQUESTER_USER_ID,
    department_ids: [],
    dept_admin_ids: [],
    version: 7,
    ...overrides,
  };
}

function makeSelectMaybeSingleBuilder(row: Record<string, unknown>) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        })),
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      })),
    })),
  };
}

function makeThenableUpdateBuilder() {
  const chain = {
    eq: vi.fn(() => chain),
    then: (resolve: (value: { error: null }) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve, reject),
  };
  return {
    update: vi.fn(() => chain),
  };
}

function makeRequestResolveBuilder(row: Record<string, unknown>) {
  return {
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
          })),
        })),
      })),
    })),
  };
}

function makeRequesterMembershipBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { org_role: "user", admin_permissions: null },
              error: null,
            }),
          })),
        })),
      })),
    })),
  };
}

function makeExistingRequestBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            })),
          })),
        })),
      })),
    })),
  };
}

function makeRequestInsertBuilder(row: Record<string, unknown>) {
  return {
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: row, error: null }),
      })),
    })),
  };
}

function makeReviewerMembershipBuilder() {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        is: vi.fn().mockResolvedValue({
          data: [
            {
              user_id: REQUESTER_USER_ID,
              org_role: "user",
              admin_permissions: null,
            },
            {
              user_id: "66666666-6666-4666-8666-666666666666",
              org_role: "admin",
              admin_permissions: { canManageEmployees: true },
            },
            {
              user_id: "77777777-7777-4777-8777-777777777777",
              org_role: "super_admin",
              admin_permissions: null,
            },
            {
              user_id: "88888888-8888-4888-8888-888888888888",
              org_role: "admin",
              admin_permissions: { canManageEmployees: false },
            },
          ],
          error: null,
        }),
      })),
    })),
  };
}

describe("createProfileChangeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLinkedEmployeeForUser.mockResolvedValue({
      id: EMPLOYEE_ID,
      firstName: "Alex",
      lastName: "Old",
      employmentType: "full_time",
      status: "active",
      statusChangedAt: null,
      statusNote: "",
      certificationId: null,
      roleIds: [],
      seniority: 1,
      focusAreaIds: [1],
      phone: "555-0100",
      email: "alex@example.com",
      contactNotes: "",
      archivedAt: null,
      userId: REQUESTER_USER_ID,
      departmentIds: [],
      deptAdminIds: [],
      version: 7,
    });
  });

  it("notifies employee managers when a profile change request is submitted", async () => {
    const createdRequestRow = makeRequestRow({
      version: 0,
      requested_changes: { firstName: "Alexandra" },
    });
    const membershipFrom = vi
      .fn()
      .mockReturnValueOnce(makeRequesterMembershipBuilder())
      .mockReturnValueOnce(makeReviewerMembershipBuilder());
    const requestFrom = vi
      .fn()
      .mockReturnValueOnce(makeExistingRequestBuilder())
      .mockReturnValueOnce(makeRequestInsertBuilder(createdRequestRow));
    const notificationInsert = vi.fn().mockResolvedValue({ error: null });

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "organization_memberships") {
          return membershipFrom();
        }
        if (table === "profile_change_requests") {
          return requestFrom();
        }
        if (table === "notifications") {
          return { insert: notificationInsert };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await createProfileChangeRequest({
      serviceClient,
      user: {
        id: REQUESTER_USER_ID,
        email: "alex@example.com",
      } as User,
      orgId: ORG_ID,
      type: "profile_update",
      requestedChanges: { firstName: "Alexandra" },
    });

    expect(notificationInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        user_id: "66666666-6666-4666-8666-666666666666",
        org_id: ORG_ID,
        type: "system",
        title: "Name change request",
        message: 'Alex Old requested name change: "Alex Old" → "Alexandra Old".',
        metadata: expect.objectContaining({
          requestedBy: "Alex Old",
          Name: "Alex Old → Alexandra Old",
          note: "Please update my legal name.",
          actionUrl: "/people?section=requests",
          actionLabel: "Review request",
        }),
      }),
      expect.objectContaining({
        user_id: "77777777-7777-4777-8777-777777777777",
        org_id: ORG_ID,
        type: "system",
      }),
    ]);
  });
});

describe("resolveProfileChangeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cacheDel.mockResolvedValue(undefined);
    deleteUserAccountWithCleanup.mockResolvedValue({ success: true });
  });

  it("records the approving admin email on employee update audit entries", async () => {
    const requestRow = makeRequestRow();
    const resolvedRequestRow = makeRequestRow({
      status: "approved",
      resolver_user_id: ACTOR_ID,
      resolver_note: "",
      resolved_at: "2026-05-01T15:05:00.000Z",
      updated_at: "2026-05-01T15:05:00.000Z",
      version: 3,
    });
    const employeeUpdate = makeThenableUpdateBuilder();
    const profileUpdate = makeThenableUpdateBuilder();
    const auditInsert = vi.fn().mockResolvedValue({ error: null });
    const notificationInsert = vi.fn().mockResolvedValue({ error: null });
    const profileChangeRequestFrom = vi
      .fn()
      .mockReturnValueOnce(makeSelectMaybeSingleBuilder(requestRow))
      .mockReturnValueOnce(makeRequestResolveBuilder(resolvedRequestRow));
    const employeeFrom = vi
      .fn()
      .mockReturnValueOnce(makeSelectMaybeSingleBuilder(makeEmployeeRow()))
      .mockReturnValueOnce(employeeUpdate);
    // profiles is called twice: an UPDATE in syncLinkedProfileName, then a
    // SELECT to look up the resolver's display name for the notification.
    const profileFrom = vi
      .fn()
      .mockReturnValueOnce(profileUpdate)
      .mockReturnValueOnce(makeSelectMaybeSingleBuilder({ first_name: "Sam", last_name: "Reed" }));

    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "profile_change_requests") {
          return profileChangeRequestFrom();
        }
        if (table === "employees") {
          return employeeFrom();
        }
        if (table === "profiles") {
          return profileFrom();
        }
        if (table === "audit_log") {
          return { insert: auditInsert };
        }
        if (table === "notifications") {
          return { insert: notificationInsert };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as SupabaseClient;

    await resolveProfileChangeRequest({
      serviceClient,
      actor: {
        id: ACTOR_ID,
        email: "approver@example.com",
      } as User,
      orgId: ORG_ID,
      requestId: REQUEST_ID,
      action: "approve",
    });

    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: ORG_ID,
        actor_id: ACTOR_ID,
        actor_email: "approver@example.com",
        action: "employee.updated",
        resource_type: "employee",
        resource_id: EMPLOYEE_ID,
      }),
    );
  });
});
