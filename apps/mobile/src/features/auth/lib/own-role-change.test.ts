import { describe, expect, it } from "vitest";
import type { MobileBootstrapResponse } from "@dubgrid/contracts";
import { decideOwnRoleChange, readOwnOrgRole } from "./own-role-change";

const ORG = "org-1";

describe("decideOwnRoleChange", () => {
  it("announces a role that changed since the app last showed it, and refreshes the token", () => {
    expect(
      decideOwnRoleChange(
        { orgId: ORG, role: "admin" },
        { orgId: ORG, role: "user" },
        { orgId: ORG, role: "user" },
      ),
    ).toEqual({ announce: "admin", refreshToken: true });
  });

  it("announces a change made while the app was closed, found on the first reading", () => {
    expect(
      decideOwnRoleChange({ orgId: ORG, role: "user" }, null, { orgId: ORG, role: "admin" }),
    ).toEqual({ announce: "user", refreshToken: true });
  });

  it("says nothing again once shown, while a failed refresh leaves the token behind", () => {
    expect(
      decideOwnRoleChange(
        { orgId: ORG, role: "admin" },
        { orgId: ORG, role: "admin" },
        { orgId: ORG, role: "user" },
      ),
    ).toEqual({ announce: null, refreshToken: true });
  });

  it("does nothing when nothing changed", () => {
    expect(
      decideOwnRoleChange({ orgId: ORG, role: "admin" }, null, { orgId: ORG, role: "admin" }),
    ).toEqual({ announce: null, refreshToken: false });
  });

  it("never treats an organization switch as a role change", () => {
    expect(
      decideOwnRoleChange(
        { orgId: "org-2", role: "user" },
        { orgId: ORG, role: "admin" },
        { orgId: "org-2", role: "user" },
      ),
    ).toEqual({ announce: null, refreshToken: false });
  });
});

describe("readOwnOrgRole", () => {
  function bootstrapWith(
    memberships: Array<{
      isCurrent: boolean;
      orgRole: "admin" | "user" | null;
      platformRole: "gridmaster" | "none";
    }>,
  ) {
    return {
      currentOrg: { id: ORG },
      memberships: memberships.map((entry, index) => ({
        id: `org-${index}`,
        name: "Org",
        slug: null,
        ...entry,
      })),
    } as unknown as MobileBootstrapResponse;
  }

  it("reads the current membership's role", () => {
    expect(
      readOwnOrgRole(
        bootstrapWith([
          { isCurrent: false, orgRole: "user", platformRole: "none" },
          { isCurrent: true, orgRole: "admin", platformRole: "none" },
        ]),
      ),
    ).toEqual({ orgId: ORG, role: "admin" });
  });

  it("skips a Gridmaster", () => {
    expect(
      readOwnOrgRole(
        bootstrapWith([{ isCurrent: true, orgRole: null, platformRole: "gridmaster" }]),
      ),
    ).toBeNull();
  });
});
