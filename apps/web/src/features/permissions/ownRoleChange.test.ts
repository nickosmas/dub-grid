import { beforeEach, describe, expect, it, vi } from "vitest";
import { catchUpOwnRoleChange, resetOwnRoleCatchUp } from "./ownRoleChange";

const USER_ID = "user-1";
const ORG_ID = "org-1";

function tokenWith(claims: Record<string, unknown>): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `header.${payload}.signature`;
}

describe("catchUpOwnRoleChange", () => {
  beforeEach(() => {
    resetOwnRoleCatchUp();
  });

  it("refreshes the session and announces the role once the new token agrees", async () => {
    const refreshSession = vi.fn(async () => tokenWith({ org_id: ORG_ID, org_role: "admin" }));
    const onCaughtUp = vi.fn();

    const role = await catchUpOwnRoleChange(
      USER_ID,
      { orgId: ORG_ID, role: "admin" },
      { orgId: ORG_ID, role: "super_admin" },
      { refreshSession, onCaughtUp },
    );

    expect(role).toBe("admin");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onCaughtUp).toHaveBeenCalledWith("admin");
  });

  it("does nothing when the token already names the server's role", async () => {
    const refreshSession = vi.fn();
    const onCaughtUp = vi.fn();

    await catchUpOwnRoleChange(
      USER_ID,
      { orgId: ORG_ID, role: "user" },
      { orgId: ORG_ID, role: "user" },
      { refreshSession, onCaughtUp },
    );

    expect(refreshSession).not.toHaveBeenCalled();
    expect(onCaughtUp).not.toHaveBeenCalled();
  });

  it("leaves a sandbox alone, where the server reads another organization", async () => {
    const refreshSession = vi.fn();

    await catchUpOwnRoleChange(
      USER_ID,
      { orgId: "sandbox-org", role: "super_admin" },
      { orgId: ORG_ID, role: "user" },
      { refreshSession, onCaughtUp: vi.fn() },
    );

    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("says nothing when the refreshed token drops the organization", async () => {
    const onCaughtUp = vi.fn();

    const role = await catchUpOwnRoleChange(
      USER_ID,
      { orgId: ORG_ID, role: "user" },
      { orgId: ORG_ID, role: "admin" },
      { refreshSession: async () => tokenWith({ org_role: "user" }), onCaughtUp },
    );

    expect(role).toBeNull();
    expect(onCaughtUp).not.toHaveBeenCalled();
  });

  it("tries once per role, however many readers ask at once", async () => {
    const refreshSession = vi.fn(async () => tokenWith({ org_id: ORG_ID, org_role: "admin" }));
    const onCaughtUp = vi.fn();
    const args = [
      USER_ID,
      { orgId: ORG_ID, role: "admin" },
      { orgId: ORG_ID, role: "user" },
      { refreshSession, onCaughtUp },
    ] as const;

    await Promise.all([catchUpOwnRoleChange(...args), catchUpOwnRoleChange(...args)]);
    await catchUpOwnRoleChange(...args);

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(onCaughtUp).toHaveBeenCalledTimes(1);
  });

  it("tries again after a refresh that failed", async () => {
    const refreshSession = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(tokenWith({ org_id: ORG_ID, org_role: "admin" }));
    const onCaughtUp = vi.fn();
    const args = [
      USER_ID,
      { orgId: ORG_ID, role: "admin" },
      { orgId: ORG_ID, role: "user" },
      { refreshSession, onCaughtUp },
    ] as const;

    await expect(catchUpOwnRoleChange(...args)).resolves.toBeNull();
    await expect(catchUpOwnRoleChange(...args)).resolves.toBe("admin");
    expect(onCaughtUp).toHaveBeenCalledTimes(1);
  });
});
