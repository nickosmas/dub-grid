import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchNotificationEvent } from "./events";
import { sendNotification } from "./sender";

const fromMock = vi.fn();

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    from: fromMock,
  }),
}));

vi.mock("@/lib/published-shifts", () => ({
  fetchPublishedShiftRows: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  default: {
    error: vi.fn(),
  },
}));

vi.mock("./sender", () => ({
  sendNotification: vi.fn(),
}));

function makeShiftRequestBuilder(data: Record<string, unknown>) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn().mockResolvedValue({ data }),
  };
  return builder;
}

function makeMembershipBuilder(input: {
  superAdmins?: Array<{ user_id: string }>;
  admins?: Array<{ user_id: string; admin_permissions: Record<string, boolean> | null }>;
}) {
  let selectedRole: string | null = null;
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: string) => {
      if (column === "org_role") {
        selectedRole = value;
      }
      return builder;
    }),
    is: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data:
          selectedRole === "super_admin"
            ? (input.superAdmins ?? [])
            : (input.admins ?? []),
      }),
    ),
  };
  return builder;
}

describe("dispatchNotificationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("notifies the targeted teammate when a swap needs their response", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "shift_requests") {
        return makeShiftRequestBuilder({
          status: "open",
          type: "swap",
          requester: {
            user_id: "requester-user",
            first_name: "Alex",
            last_name: "North",
          },
          target: {
            user_id: "target-user",
            first_name: "Bri",
            last_name: "Shaw",
          },
        });
      }
      return makeMembershipBuilder({});
    });

    await dispatchNotificationEvent("requester-user", {
      action: "shift_request_created",
      orgId: "org-1",
      requestId: "request-1",
      requestType: "swap",
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      "target-user",
      "org-1",
      "shift_request_new",
      "Swap response needed",
      "Alex North sent you a swap request.",
      {
        requestId: "request-1",
        requestType: "swap",
        action: "respond_to_request",
        tab: "mine",
      },
    );
  });

  it("notifies shift request approvers when a request needs approval", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "shift_requests") {
        return makeShiftRequestBuilder({
          status: "pending_approval",
          type: "calloff",
          requester: {
            user_id: "requester-user",
            first_name: "Alex",
            last_name: "North",
          },
          target: null,
        });
      }
      return makeMembershipBuilder({
        superAdmins: [{ user_id: "super-admin-user" }],
        admins: [
          {
            user_id: "approver-user",
            admin_permissions: { canApproveShiftRequests: true },
          },
          {
            user_id: "schedule-only-user",
            admin_permissions: { canApproveShiftRequests: false },
          },
        ],
      });
    });

    await dispatchNotificationEvent("requester-user", {
      action: "shift_request_created",
      orgId: "org-1",
      requestId: "request-1",
      requestType: "calloff",
    });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      "super-admin-user",
      "org-1",
      "shift_request_new",
      "New calloff request",
      "Alex North submitted a calloff request that needs your approval.",
      {
        requestId: "request-1",
        requestType: "calloff",
        action: "approve_request",
        tab: "approval",
      },
    );
    expect(sendNotification).toHaveBeenCalledWith(
      "approver-user",
      "org-1",
      "shift_request_new",
      "New calloff request",
      "Alex North submitted a calloff request that needs your approval.",
      {
        requestId: "request-1",
        requestType: "calloff",
        action: "approve_request",
        tab: "approval",
      },
    );
    expect(sendNotification).not.toHaveBeenCalledWith(
      "schedule-only-user",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  // ── New PR2 events ────────────────────────────────────────────────────

  function makeSingleRowBuilder(row: Record<string, unknown> | null) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      not: vi.fn(() => builder),
      is: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: row }),
    };
    return builder;
  }

  function makeListBuilder(rows: Array<Record<string, unknown>>) {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.in = vi.fn(() => builder);
    builder.not = vi.fn().mockResolvedValue({ data: rows });
    return builder;
  }

  it("notifies the affected employee when a recurring shift is upserted", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "employees") {
        return makeSingleRowBuilder({ user_id: "emp-user" });
      }
      return makeSingleRowBuilder(null);
    });

    await dispatchNotificationEvent("admin-user", {
      action: "recurring_shift_updated",
      orgId: "org-1",
      empId: "emp-1",
      mode: "upsert",
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      "emp-user",
      "org-1",
      "recurring_shift_updated",
      "Recurring shift updated",
      "Your recurring shift was updated.",
      { empId: "emp-1", mode: "upsert" },
    );
  });

  it("skips schedule note notification when status is draft", async () => {
    fromMock.mockImplementation(() => makeSingleRowBuilder({ user_id: "emp-user" }));

    await dispatchNotificationEvent("admin-user", {
      action: "schedule_note_changed",
      orgId: "org-1",
      empId: "emp-1",
      date: "2026-05-20",
      mode: "upsert",
      status: "draft",
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("notifies the employee when a published schedule note is added", async () => {
    fromMock.mockImplementation(() => makeSingleRowBuilder({ user_id: "emp-user" }));

    await dispatchNotificationEvent("admin-user", {
      action: "schedule_note_changed",
      orgId: "org-1",
      empId: "emp-1",
      date: "2026-05-20",
      mode: "upsert",
      status: "published",
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      "emp-user",
      "org-1",
      "schedule_note_published",
      "Schedule note added",
      "Schedule note added for 2026-05-20.",
      { empId: "emp-1", date: "2026-05-20", mode: "upsert" },
    );
  });

  it("notifies all affected employees when recurring schedules are applied", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "employees") {
        return makeListBuilder([
          { user_id: "u1" },
          { user_id: "u2" },
        ]);
      }
      return makeSingleRowBuilder(null);
    });

    await dispatchNotificationEvent("admin-user", {
      action: "recurring_schedules_applied",
      orgId: "org-1",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      affectedEmpIds: ["emp-1", "emp-2"],
    });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      "u1",
      "org-1",
      "recurring_schedules_applied",
      "Recurring shifts applied",
      expect.stringContaining("2026-05-01"),
      expect.objectContaining({ startDate: "2026-05-01", endDate: "2026-05-31" }),
    );
  });

  it("notifies the removed user and super_admins on membership_removed", async () => {
    let call = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "organizations") {
        return makeSingleRowBuilder({ name: "Acme" });
      }
      if (table === "organization_memberships") {
        call++;
        // Return super-admins list
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({
                  data: [{ user_id: "super-1" }, { user_id: "super-2" }],
                }),
              })),
            })),
          })),
        };
      }
      return makeSingleRowBuilder(null);
    });
    void call;

    await dispatchNotificationEvent("super-1", {
      action: "membership_removed",
      orgId: "org-1",
      removedUserId: "removed-user",
    });

    // super-1 is actor → excluded. Should notify super-2 + removed-user.
    expect(sendNotification).toHaveBeenCalledTimes(2);
    const calls = (sendNotification as ReturnType<typeof vi.fn>).mock.calls;
    const recipients = calls.map((c) => c[0]);
    expect(recipients).toContain("super-2");
    expect(recipients).toContain("removed-user");
    expect(recipients).not.toContain("super-1");
  });

  it("does not notify the actor when admin_permissions_changed targets themselves", async () => {
    await dispatchNotificationEvent("self-user", {
      action: "admin_permissions_changed",
      orgId: "org-1",
      targetUserId: "self-user",
      before: { canApproveShiftRequests: true },
      after: { canApproveShiftRequests: false },
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips employee_profile_changed when the affected employee has no linked user", async () => {
    fromMock.mockImplementation(() => makeSingleRowBuilder({ user_id: null }));

    await dispatchNotificationEvent("admin-user", {
      action: "employee_profile_changed",
      orgId: "org-1",
      empId: "emp-1",
      fields: ["firstName"],
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
