import { describe, expect, it } from "vitest";
import { canOfferMoveToNewEmail } from "./move-email";

const joined = { userId: "user-2", status: "active" };

describe("canOfferMoveToNewEmail", () => {
  it("offers it for a joined User, or someone with no membership, to any manager", () => {
    for (const orgRole of ["user", null] as const) {
      expect(
        canOfferMoveToNewEmail({
          employee: joined,
          orgRole,
          currentUserId: "user-1",
          canGrantElevatedRoles: false,
        }),
      ).toBe(true);
    }
  });

  it("offers an Admin or Super Admin only to someone who can grant that access", () => {
    for (const orgRole of ["admin", "super_admin"] as const) {
      const base = { employee: joined, orgRole, currentUserId: "user-1" };
      expect(canOfferMoveToNewEmail({ ...base, canGrantElevatedRoles: false })).toBe(false);
      expect(canOfferMoveToNewEmail({ ...base, canGrantElevatedRoles: true })).toBe(true);
    }
  });

  it("never offers it for someone who hasn't joined, is offboarded, or is the viewer", () => {
    const base = { orgRole: "user" as const, canGrantElevatedRoles: true };
    expect(
      canOfferMoveToNewEmail({
        ...base,
        employee: { userId: null, status: "active" },
        currentUserId: "user-1",
      }),
    ).toBe(false);
    expect(
      canOfferMoveToNewEmail({
        ...base,
        employee: { userId: "user-2", status: "removed" },
        currentUserId: "user-1",
      }),
    ).toBe(false);
    expect(canOfferMoveToNewEmail({ ...base, employee: joined, currentUserId: "user-2" })).toBe(
      false,
    );
  });
});
