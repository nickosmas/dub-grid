import { beforeEach, describe, expect, it, vi } from "vitest";

const endUserSessionsInOrganization = vi.fn();
const disableMobilePushTokensForOrg = vi.fn();
const membershipUpdate = vi.fn();
let membershipError: unknown;

vi.mock("@/lib/auth/revocation", () => ({
  endUserSessionsInOrganization: (...args: unknown[]) => endUserSessionsInOrganization(...args),
}));
vi.mock("@dubgrid/data-access", () => ({
  disableMobilePushTokensForOrg: (...args: unknown[]) => disableMobilePushTokensForOrg(...args),
}));
vi.mock("@/lib/db/shared", () => ({
  cacheDel: vi.fn(),
  CacheKey: {
    orgUsers: () => "users",
    orgDirectory: () => "directory",
    employees: () => "employees",
    allUsers: () => "all",
  },
}));
vi.mock("@/lib/logger", () => ({ default: { error: vi.fn() } }));

function serviceClient() {
  return {
    from: () => {
      const chain = {
        update: (values: unknown) => {
          membershipUpdate(values);
          return chain;
        },
        eq: () => chain,
        is: () => Promise.resolve({ error: membershipError }),
      };
      return chain;
    },
  } as never;
}

const input = { orgId: "org-a", userId: "user-1", actorId: "actor-1", at: "2026-11-05T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  membershipError = null;
  endUserSessionsInOrganization.mockResolvedValue(undefined);
});

describe("endAccessInOrganization", () => {
  it("ends only the sessions open in this organization", async () => {
    const { endAccessInOrganization } = await import("./offboard-access");

    await endAccessInOrganization(serviceClient(), input);

    expect(endUserSessionsInOrganization).toHaveBeenCalledExactlyOnceWith("user-1", "org-a");
    expect(membershipUpdate).toHaveBeenCalledWith({
      archived_at: input.at,
      archived_by: "actor-1",
    });
    expect(disableMobilePushTokensForOrg).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      orgId: "org-a",
    });
  });

  it("throws when the membership stays open, before ending anything", async () => {
    membershipError = new Error("boom");
    const { endAccessInOrganization } = await import("./offboard-access");

    await expect(endAccessInOrganization(serviceClient(), input)).rejects.toThrow("boom");
    expect(endUserSessionsInOrganization).not.toHaveBeenCalled();
  });

  it("doesn't fail the move when a session can't be ended", async () => {
    endUserSessionsInOrganization.mockRejectedValue(new Error("gone"));
    const { endAccessInOrganization } = await import("./offboard-access");

    await expect(endAccessInOrganization(serviceClient(), input)).resolves.toBeUndefined();
  });
});

describe("endOffboardedAccess", () => {
  const offboard = {
    orgId: "org-a",
    empId: "emp-1",
    userId: "user-1",
    actorId: "actor-1",
    at: input.at,
  };

  it("signs them out of this organization only and archives its membership", async () => {
    const { endOffboardedAccess } = await import("./offboard-access");

    await endOffboardedAccess(serviceClient(), offboard);

    expect(endUserSessionsInOrganization).toHaveBeenCalledExactlyOnceWith("user-1", "org-a");
    expect(membershipUpdate).toHaveBeenCalledWith({
      archived_at: input.at,
      archived_by: "actor-1",
    });
  });

  it("still archives the membership when ending sessions fails", async () => {
    endUserSessionsInOrganization.mockRejectedValue(new Error("redis down"));
    const { endOffboardedAccess } = await import("./offboard-access");

    await endOffboardedAccess(serviceClient(), offboard);

    expect(membershipUpdate).toHaveBeenCalled();
  });
});
