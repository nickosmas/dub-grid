import type { MobileProfileResponse } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import {
  makeProfileDraft,
  profileDraftHasChanges,
  profileNameChanged,
  profilePhoneChanged,
  type LinkedEmployee,
} from "./profile-draft";

const linkedEmployee = {
  phone: "(555) 010-0100",
  employmentType: "full_time",
  certificationId: 5,
  focusAreaIds: [1, 2],
  roleIds: [3, 4],
  departmentIds: [7, 8],
  contactNotes: "",
} as unknown as LinkedEmployee;

const profile = {
  user: { firstName: "Mina", lastName: "Diaz", email: "mina@dubgrid.com" },
  linkedEmployee,
} as unknown as MobileProfileResponse;

const opened = () => makeProfileDraft(profile, linkedEmployee);

describe("profileDraftHasChanges", () => {
  it("is clean as the editor opens", () => {
    expect(profileDraftHasChanges(opened(), profile, linkedEmployee)).toBe(false);
  });

  it("reads ids picked in another order as unchanged", () => {
    const draft = { ...opened(), focusAreaIds: [2, 1], roleIds: [4, 3], departmentIds: [8, 7] };

    expect(profileDraftHasChanges(draft, profile, linkedEmployee)).toBe(false);
  });

  it("sees a change to the departments", () => {
    const draft = { ...opened(), departmentIds: [7] };

    expect(profileDraftHasChanges(draft, profile, linkedEmployee)).toBe(true);
  });

  it("leaves an untouched phone clean when it was saved in another format", () => {
    const dashed = { ...linkedEmployee, phone: "555-010-0100" } as LinkedEmployee;
    const draft = makeProfileDraft(profile, dashed);

    expect(profilePhoneChanged(draft, dashed)).toBe(false);
    expect(profileDraftHasChanges(draft, profile, dashed)).toBe(false);
  });

  it("leaves an untouched name clean when it was saved with extra spaces", () => {
    const spaced = {
      ...profile,
      user: { ...profile.user, firstName: "Mina  Rose ", lastName: " Diaz" },
    } as MobileProfileResponse;
    const draft = makeProfileDraft(spaced, linkedEmployee);

    expect(profileNameChanged(draft, spaced)).toBe(false);
    expect(profileDraftHasChanges(draft, spaced, linkedEmployee)).toBe(false);
  });

  it("sees a real name or phone edit", () => {
    expect(profileNameChanged({ ...opened(), lastName: "Diaz-Ruiz" }, profile)).toBe(true);
    expect(profilePhoneChanged({ ...opened(), phone: "555-010-0101" }, linkedEmployee)).toBe(true);
  });

  it("leaves an untouched phone clean when the saved one carries stray spaces", () => {
    const spaced = { ...linkedEmployee, phone: " (555) 010-0100 " } as LinkedEmployee;
    const draft = makeProfileDraft(profile, spaced);

    expect(profileDraftHasChanges(draft, profile, spaced)).toBe(false);
  });
});
