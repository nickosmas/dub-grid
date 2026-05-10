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
});
