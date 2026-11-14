import type { MobilePerson } from "@dubgrid/contracts";
import { describe, expect, it } from "vitest";
import {
  makePersonDraft,
  personDraftHasChanges,
  personEmailChanged,
  scheduleAssignmentsChanged,
} from "./personDraft";

function person(overrides: Partial<MobilePerson> = {}): MobilePerson {
  return {
    firstName: "Mina",
    lastName: "Diaz",
    employmentType: "full_time",
    phone: "(555) 010-0100",
    email: "mina@dubgrid.com",
    contactNotes: "Prefers texts",
    certificationId: 5,
    focusAreaIds: [1, 2],
    roleIds: [3, 4],
    departmentIds: [7],
    ...overrides,
  } as MobilePerson;
}

describe("personDraftHasChanges", () => {
  it("leaves a stored email in capitals, or a phone in another format, unchanged", () => {
    const saved = person({ email: "Mina@DubGrid.com", phone: "555-010-0100" });
    const draft = makePersonDraft(saved);

    expect(personEmailChanged(draft, saved)).toBe(false);
    expect(personDraftHasChanges(draft, saved)).toBe(false);
    expect(personEmailChanged({ ...draft, email: "mina@dubgrid.com" }, saved)).toBe(false);
    expect(personEmailChanged({ ...draft, email: "mina.diaz@dubgrid.com" }, saved)).toBe(true);
  });

  it("keeps the version the edit was opened from", () => {
    expect(makePersonDraft(person({ version: 7 })).baseVersion).toBe(7);
  });

  it("leaves an untouched draft clean when the saved value carries stray spaces", () => {
    const saved = person({ firstName: "Mina ", contactNotes: " Prefers texts " });

    expect(personDraftHasChanges(makePersonDraft(saved), saved)).toBe(false);
  });

  it("ignores spaces typed around the notes, which the save trims", () => {
    const saved = person();
    const draft = { ...makePersonDraft(saved), contactNotes: "Prefers texts   " };

    expect(personDraftHasChanges(draft, saved)).toBe(false);
  });

  it("sees a real change to the notes", () => {
    const saved = person();
    const draft = { ...makePersonDraft(saved), contactNotes: "Prefers calls" };

    expect(personDraftHasChanges(draft, saved)).toBe(true);
  });

  it("reads ids picked in another order as unchanged", () => {
    const saved = person();
    const draft = { ...makePersonDraft(saved), focusAreaIds: [2, 1], roleIds: [4, 3] };

    expect(personDraftHasChanges(draft, saved)).toBe(false);
  });
});

describe("scheduleAssignmentsChanged", () => {
  const saved = { certificationId: 5, focusAreaIds: [1, 2], roleIds: [3] };

  it("sees a focus area or role swapped for another, though the count is the same", () => {
    expect(scheduleAssignmentsChanged({ ...saved, focusAreaIds: [1, 9] }, saved)).toBe(true);
    expect(scheduleAssignmentsChanged({ ...saved, roleIds: [8] }, saved)).toBe(true);
  });

  it("reads a reorder as unchanged", () => {
    expect(scheduleAssignmentsChanged({ ...saved, focusAreaIds: [2, 1] }, saved)).toBe(false);
  });

  it("sees a changed certification", () => {
    expect(scheduleAssignmentsChanged({ ...saved, certificationId: null }, saved)).toBe(true);
  });
});
