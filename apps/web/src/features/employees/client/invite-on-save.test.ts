import { describe, expect, it } from "vitest";
import {
  describeInviteOnSave,
  describeInviteOnSaveNote,
  invitationRequestForSave,
  inviteRoleOptions,
  type InviteOnSaveInput,
} from "./invite-on-save";
import type { Invitation } from "@/types";

const base: InviteOnSaveInput = {
  hasAccount: false,
  savedEmail: "",
  typedEmail: "",
  pendingInvitationEmail: null,
  canInvite: true,
  inSandbox: false,
};

const describeWith = (overrides: Partial<InviteOnSaveInput>) =>
  describeInviteOnSave({ ...base, ...overrides });

describe("describeInviteOnSave", () => {
  it("offers a ticked invite when an email is added", () => {
    expect(describeWith({ typedEmail: "maria@example.com" })).toEqual({
      kind: "invite",
      defaultChecked: true,
    });
  });

  it("offers a ticked invite when an uninvited person's email changes", () => {
    expect(describeWith({ savedEmail: "old@example.com", typedEmail: "new@example.com" })).toEqual({
      kind: "invite",
      defaultChecked: true,
    });
  });

  it("offers an unticked invite when the email is unchanged, so a plain save sends nothing", () => {
    expect(
      describeWith({ savedEmail: "maria@example.com", typedEmail: " Maria@Example.com " }),
    ).toEqual({ kind: "invite", defaultChecked: false });
  });

  it("offers a ticked reinvite when the email of a pending invitation changes", () => {
    expect(
      describeWith({
        savedEmail: "old@example.com",
        typedEmail: "new@example.com",
        pendingInvitationEmail: "old@example.com",
      }),
    ).toEqual({ kind: "reinvite", defaultChecked: true });
  });

  it("offers nothing while an invitation is pending and the email is unchanged", () => {
    expect(
      describeWith({
        savedEmail: "maria@example.com",
        typedEmail: "maria@example.com",
        pendingInvitationEmail: "maria@example.com",
      }),
    ).toBeNull();
  });

  it("offers nothing when the typed email is the pending invitation's own address", () => {
    expect(
      describeWith({
        savedEmail: "old@example.com",
        typedEmail: "maria@example.com",
        pendingInvitationEmail: "Maria@example.com",
      }),
    ).toBeNull();
  });

  it.each([
    ["the person has an account", { hasAccount: true }],
    ["the viewer can't invite", { canInvite: false }],
    ["the viewer is in Test Sandbox", { inSandbox: true }],
  ])("offers nothing when %s", (_, overrides) => {
    expect(describeWith({ typedEmail: "maria@example.com", ...overrides })).toBeNull();
  });

  it.each(["", "   ", "maria@", "not an email"])("offers nothing for %j", (typedEmail) => {
    expect(describeWith({ typedEmail })).toBeNull();
  });
});

describe("describeInviteOnSaveNote", () => {
  it("says an invite goes out on save only when ticked", () => {
    expect(describeInviteOnSaveNote("invite", true, "")).toBe(
      "We email them a link to join when you save.",
    );
    expect(describeInviteOnSaveNote("invite", false, "")).toBeNull();
  });

  it("names the old address for a reinvite either way", () => {
    expect(describeInviteOnSaveNote("reinvite", true, "old@example.com")).toBe(
      "We email a new link here when you save. The link sent to old@example.com stops working.",
    );
    expect(describeInviteOnSaveNote("reinvite", false, "old@example.com")).toBe(
      "Their invitation to old@example.com is canceled when you save, because it was for the old email.",
    );
  });
});

describe("invitationRequestForSave", () => {
  const saved = {
    id: "emp-1",
    email: "new@example.com",
    firstName: "Ana",
    lastName: "Lee",
    phone: "",
  };

  it("sends a new invite with the chosen role and permissions", () => {
    expect(
      invitationRequestForSave(
        saved,
        { kind: "invite", role: "admin", adminPermissions: { canEditShifts: true } as never },
        "org-1",
      ),
    ).toEqual({
      email: "new@example.com",
      orgId: "org-1",
      employeeId: "emp-1",
      role: "admin",
      adminPermissions: { canEditShifts: true },
    });
  });

  it("leaves permissions out when none were chosen", () => {
    expect(
      invitationRequestForSave(saved, { kind: "invite", role: "user" }, "org-1"),
    ).not.toHaveProperty("adminPermissions");
  });

  it("gives a reinvite the replaced invitation's role and teams", () => {
    const replacing = {
      roleToAssign: "admin",
      departmentIds: [3],
      deptAdminIds: [4],
    } as Invitation;
    expect(invitationRequestForSave(saved, { kind: "reinvite", replacing }, "org-1")).toEqual({
      email: "new@example.com",
      orgId: "org-1",
      employeeId: "emp-1",
      role: "admin",
      firstName: "Ana",
      lastName: "Lee",
      phone: undefined,
      departmentIds: [3],
      deptAdminIds: [4],
    });
  });
});

describe("inviteRoleOptions", () => {
  it("offers an Admin only User (F-237)", () => {
    expect(inviteRoleOptions(false)).toEqual([{ value: "user", label: "User" }]);
  });

  it("offers a Super Admin or Gridmaster every tier, least privileged first", () => {
    expect(inviteRoleOptions(true).map((option) => option.value)).toEqual([
      "user",
      "admin",
      "super_admin",
    ]);
  });
});
