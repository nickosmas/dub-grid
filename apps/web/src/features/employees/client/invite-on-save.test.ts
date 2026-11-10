import { describe, expect, it } from "vitest";
import {
  describeInviteOnSave,
  describeInviteOnSaveNote,
  inviteOnSaveButtonLabel,
  type InviteOnSaveInput,
} from "./invite-on-save";

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

describe("inviteOnSaveButtonLabel", () => {
  it("names the invite on the save button", () => {
    expect(inviteOnSaveButtonLabel(true)).toBe("Save & invite");
    expect(inviteOnSaveButtonLabel(false)).toBe("Save changes");
  });
});
