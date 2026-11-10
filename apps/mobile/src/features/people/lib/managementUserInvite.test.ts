import { describe, expect, it } from "vitest";
import {
  EMPTY_MANAGEMENT_USER_INVITE,
  managementUserInviteHasChanges,
} from "./managementUserInvite";

describe("managementUserInviteHasChanges", () => {
  it("is clean as the form opens", () => {
    expect(managementUserInviteHasChanges(EMPTY_MANAGEMENT_USER_INVITE)).toBe(false);
  });

  it("counts a changed access role on its own", () => {
    expect(
      managementUserInviteHasChanges({ ...EMPTY_MANAGEMENT_USER_INVITE, orgRole: "admin" }),
    ).toBe(true);
  });

  it("counts anything typed or picked", () => {
    expect(managementUserInviteHasChanges({ ...EMPTY_MANAGEMENT_USER_INVITE, email: "a" })).toBe(
      true,
    );
    expect(
      managementUserInviteHasChanges({
        ...EMPTY_MANAGEMENT_USER_INVITE,
        managementDepartmentIds: [9],
      }),
    ).toBe(true);
  });
});
