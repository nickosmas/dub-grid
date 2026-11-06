import { beforeEach, describe, expect, it, vi } from "vitest";

const endUserSession = vi.fn();
const disableMobilePushTokensForOrg = vi.fn();
const sessionsEq = vi.fn();
const membershipUpdate = vi.fn();
let membershipError: unknown;

vi.mock("@/lib/auth/revocation", () => ({
  endUserSession: (...args: unknown[]) => endUserSession(...args),
  revokeAllUserSessions: vi.fn(),
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
    from: (table: string) => {
      if (table === "user_sessions") {
        const chain = {
          select: () => chain,
          eq: (column: string, value: string) => {
            sessionsEq(column, value);
            return column === "active_org_id"
              ? Promise.resolve({
                  data: [{ supabase_session_id: "here-1" }, { supabase_session_id: null }],
                  error: null,
                })
              : chain;
          },
        };
        return chain;
      }
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

describe("endAccessInOrganization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membershipError = null;
    endUserSession.mockResolvedValue(undefined);
  });

  it("ends only the sessions open in this organization", async () => {
    const { endAccessInOrganization } = await import("./offboard-access");

    await endAccessInOrganization(serviceClient(), input);

    expect(sessionsEq).toHaveBeenCalledWith("active_org_id", "org-a");
    expect(endUserSession).toHaveBeenCalledTimes(1);
    expect(endUserSession).toHaveBeenCalledWith("user-1", "here-1");
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
    expect(endUserSession).not.toHaveBeenCalled();
  });

  it("doesn't fail the move when a session can't be ended", async () => {
    endUserSession.mockRejectedValue(new Error("gone"));
    const { endAccessInOrganization } = await import("./offboard-access");

    await expect(endAccessInOrganization(serviceClient(), input)).resolves.toBeUndefined();
  });
});
