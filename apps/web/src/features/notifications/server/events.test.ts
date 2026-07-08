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
        data: selectedRole === "super_admin" ? (input.superAdmins ?? []) : (input.admins ?? []),
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
        return makeListBuilder([{ user_id: "u1" }, { user_id: "u2" }]);
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

  // ── Security (account-level) ──────────────────────────────────────────

  it("dispatches security_new_device with writeInApp:false (email + push only)", async () => {
    await dispatchNotificationEvent("user-1", {
      action: "security_new_device",
      orgId: "org-1",
      targetUserId: "user-1",
      platform: "ios",
      deviceLabel: "Pixel 8",
      ipAddress: "1.2.3.4",
    });

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      "user-1",
      "org-1",
      "security_new_device",
      "New sign-in on your account",
      expect.stringContaining("Pixel 8"),
      expect.objectContaining({
        platform: "ios",
        deviceLabel: "Pixel 8",
        ipAddress: "1.2.3.4",
      }),
      { writeInApp: false },
    );
  });

  it("dispatches security_mfa_changed with writeInApp:false (email + push only)", async () => {
    await dispatchNotificationEvent("user-1", {
      action: "security_mfa_changed",
      orgId: "org-1",
      targetUserId: "user-1",
      enabled: true,
    });
    expect(sendNotification).toHaveBeenLastCalledWith(
      "user-1",
      "org-1",
      "security_mfa_changed",
      "Two-factor authentication enabled",
      expect.any(String),
      { enabled: true },
      { writeInApp: false },
    );

    await dispatchNotificationEvent("user-1", {
      action: "security_mfa_changed",
      orgId: "org-1",
      targetUserId: "user-1",
      enabled: false,
    });
    expect(sendNotification).toHaveBeenLastCalledWith(
      "user-1",
      "org-1",
      "security_mfa_changed",
      "Two-factor authentication disabled",
      expect.any(String),
      { enabled: false },
      { writeInApp: false },
    );
  });

  it("skips dispatch entirely for self-initiated security_session_revoked", async () => {
    await dispatchNotificationEvent("user-1", {
      action: "security_session_revoked",
      orgId: "org-1",
      targetUserId: "user-1",
      initiatedBy: "self",
      deviceLabel: "Chrome on macOS",
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("writes an in-app session_revoked alert when a gridmaster force-logs you out", async () => {
    await dispatchNotificationEvent("gridmaster-1", {
      action: "security_session_revoked",
      orgId: "org-1",
      targetUserId: "user-1",
      initiatedBy: "gridmaster",
    });
    expect(sendNotification).toHaveBeenLastCalledWith(
      "user-1",
      "org-1",
      "security_session_revoked",
      "You were signed out by an administrator",
      expect.any(String),
      { initiatedBy: "gridmaster", deviceLabel: null },
    );
  });

  // ── Billing (super_admin-targeted) ────────────────────────────────────

  function makeBillingFromMock(input: {
    orgName?: string;
    superAdmins: Array<{ user_id: string }>;
    priorBillingRowExists: boolean;
  }) {
    return (table: string) => {
      if (table === "organizations") {
        return makeSingleRowBuilder({ name: input.orgName ?? "Acme Corp" });
      }
      if (table === "organization_memberships") {
        // super_admin lookup uses .select().eq("org_id").eq("org_role").is("archived_at")
        return makeMembershipBuilder({ superAdmins: input.superAdmins });
      }
      if (table === "notifications") {
        // hasBillingNotification: .select("id").eq().eq().eq().limit()
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.limit = vi.fn().mockResolvedValue({
          data: input.priorBillingRowExists ? [{ id: "x" }] : [],
        });
        return builder;
      }
      return makeSingleRowBuilder(null);
    };
  }

  it("fans out billing_payment_failed to all super_admins, dedupes on stripeInvoiceId", async () => {
    fromMock.mockImplementation(
      makeBillingFromMock({
        orgName: "Sunrise Senior Living",
        superAdmins: [{ user_id: "sa-1" }, { user_id: "sa-2" }],
        priorBillingRowExists: false,
      }),
    );

    await dispatchNotificationEvent("stripe-webhook", {
      action: "billing_payment_failed",
      orgId: "org-1",
      stripeInvoiceId: "in_test_123",
      amountDue: 4900,
      currency: "usd",
    });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith(
      "sa-1",
      "org-1",
      "billing_payment_failed",
      "Payment failed",
      expect.stringContaining("Sunrise Senior Living"),
      expect.objectContaining({ stripeInvoiceId: "in_test_123" }),
    );
  });

  it("skips billing_payment_failed dispatch when a prior row exists for the same invoice", async () => {
    fromMock.mockImplementation(
      makeBillingFromMock({
        superAdmins: [{ user_id: "sa-1" }],
        priorBillingRowExists: true,
      }),
    );

    await dispatchNotificationEvent("stripe-webhook", {
      action: "billing_payment_failed",
      orgId: "org-1",
      stripeInvoiceId: "in_test_456",
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("fans out billing_trial_ending_soon and skips when periodKey already alerted", async () => {
    fromMock.mockImplementation(
      makeBillingFromMock({
        superAdmins: [{ user_id: "sa-1" }],
        priorBillingRowExists: false,
      }),
    );
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_ending_soon",
      orgId: "org-1",
      trialEndsAt: "2026-06-11T00:00:00Z",
      periodKey: "2026-06-11",
    });
    expect(sendNotification).toHaveBeenCalledWith(
      "sa-1",
      "org-1",
      "billing_trial_ending_soon",
      "Your trial ends soon",
      expect.stringContaining("2026"),
      { trialEndsAt: "2026-06-11T00:00:00Z", periodKey: "2026-06-11" },
    );

    vi.mocked(sendNotification).mockClear();
    fromMock.mockImplementation(
      makeBillingFromMock({
        superAdmins: [{ user_id: "sa-1" }],
        priorBillingRowExists: true,
      }),
    );
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_ending_soon",
      orgId: "org-1",
      trialEndsAt: "2026-06-11T00:00:00Z",
      periodKey: "2026-06-11",
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  // ── Expiry sweepers + dept change ─────────────────────────────────────

  it("notifies the requester when a shift_request_expired fires", async () => {
    let firstCall = true;
    fromMock.mockImplementation((table: string) => {
      if (table === "shift_requests") {
        return makeShiftRequestBuilder({
          status: "expired",
          type: "pickup",
          requester: { user_id: "requester-user", first_name: "Sam", last_name: "Lee" },
          target: null,
        });
      }
      if (table === "notifications") {
        // hasExistingNotification dedup lookup → return empty first time
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.limit = vi.fn(() => {
          const res = firstCall ? { data: [] } : { data: [{ id: "x" }] };
          firstCall = false;
          return res;
        });
        return builder;
      }
      return makeSingleRowBuilder(null);
    });

    await dispatchNotificationEvent("expire-requests-cron", {
      action: "shift_request_expired",
      orgId: "org-1",
      requestId: "req-1",
      requestType: "pickup",
    });

    expect(sendNotification).toHaveBeenCalledWith(
      "requester-user",
      "org-1",
      "shift_request_expired",
      "Pickup request expired",
      expect.stringContaining("expired"),
      expect.objectContaining({ requestId: "req-1", requestType: "pickup" }),
    );
  });

  it("fans out invitation_expired to super_admins + inviter", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "invitations") {
        return makeSingleRowBuilder({
          invited_by: "inviter-user",
          email: "alex@example.com",
          org_id: "org-1",
        });
      }
      if (table === "organization_memberships") {
        return makeMembershipBuilder({
          superAdmins: [{ user_id: "sa-1" }, { user_id: "inviter-user" }],
        });
      }
      if (table === "organizations") {
        return makeSingleRowBuilder({ name: "Acme" });
      }
      if (table === "notifications") {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.limit = vi.fn().mockResolvedValue({ data: [] });
        return builder;
      }
      return makeSingleRowBuilder(null);
    });

    await dispatchNotificationEvent("expire-requests-cron", {
      action: "invitation_expired",
      orgId: "org-1",
      invitationId: "inv-1",
      inviteeEmail: "alex@example.com",
    });

    // sa-1 + inviter-user (deduped because inviter is also a super_admin)
    const calls = vi.mocked(sendNotification).mock.calls;
    const recipients = calls.map((c) => c[0]);
    expect(new Set(recipients)).toEqual(new Set(["sa-1", "inviter-user"]));
    expect(calls[0]).toEqual([
      expect.any(String),
      "org-1",
      "invitation_expired",
      "Invitation expired",
      expect.stringContaining("alex@example.com"),
      expect.objectContaining({ invitationId: "inv-1", inviteeEmail: "alex@example.com" }),
    ]);
  });

  it("dispatches member_dept_changed with added/removed list copy", async () => {
    await dispatchNotificationEvent("admin-user", {
      action: "member_dept_changed",
      orgId: "org-1",
      targetUserId: "target-user",
      addedDepartmentNames: ["Surgery"],
      removedDepartmentNames: ["Recovery"],
    });

    expect(sendNotification).toHaveBeenCalledWith(
      "target-user",
      "org-1",
      "member_dept_changed",
      "Your departments changed",
      "You were added to Surgery and removed from Recovery.",
      { added: ["Surgery"], removed: ["Recovery"] },
    );
  });

  it("skips member_dept_changed when actor == target or no changes", async () => {
    await dispatchNotificationEvent("self-user", {
      action: "member_dept_changed",
      orgId: "org-1",
      targetUserId: "self-user",
      addedDepartmentNames: ["A"],
      removedDepartmentNames: [],
    });
    expect(sendNotification).not.toHaveBeenCalled();

    await dispatchNotificationEvent("admin", {
      action: "member_dept_changed",
      orgId: "org-1",
      targetUserId: "target",
      addedDepartmentNames: [],
      removedDepartmentNames: [],
    });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("fans out billing_trial_expired with trialEndsAt-based dedup", async () => {
    fromMock.mockImplementation(
      makeBillingFromMock({
        superAdmins: [{ user_id: "sa-1" }],
        priorBillingRowExists: false,
      }),
    );
    await dispatchNotificationEvent("trial-expiry-cron", {
      action: "billing_trial_expired",
      orgId: "org-1",
      trialEndsAt: "2026-06-08T00:00:00Z",
    });
    expect(sendNotification).toHaveBeenLastCalledWith(
      "sa-1",
      "org-1",
      "billing_trial_expired",
      "Your trial has ended",
      expect.any(String),
      { trialEndsAt: "2026-06-08T00:00:00Z" },
    );
  });
});
