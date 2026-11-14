import { comparablePhone, type MobilePerson } from "@dubgrid/contracts";
import { sameIds } from "../../../shared/lib/same-ids";

/** What the person page's edit panel holds while it is open. */
export type PersonEditDraft = {
  firstName: string;
  lastName: string;
  employmentType: MobilePerson["employmentType"];
  phone: string;
  email: string;
  contactNotes: string;
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
  /**
   * The record version the draft was opened from. A save sends this, not the
   * latest version, so a teammate's change that lands mid-edit is a conflict
   * to resolve rather than something the save quietly reverts.
   */
  baseVersion: number;
};

export function makePersonDraft(person: MobilePerson): PersonEditDraft {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    employmentType: person.employmentType,
    phone: person.phone,
    email: person.email,
    contactNotes: person.contactNotes,
    certificationId: person.certificationId,
    focusAreaIds: person.focusAreaIds,
    roleIds: person.roleIds,
    departmentIds: person.departmentIds,
    baseVersion: person.version,
  };
}

// Compared the way the save writes them: names with their spaces collapsed,
// emails lowercased, phones in one format. A stored "Jane@X.com" or
// "555-123-4567" is not an edit.
const nameKey = (value: string) => value.trim().replace(/\s+/g, " ");
const emailKey = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Whether the draft changes the person's email, which is also their sign-in. */
export function personEmailChanged(draft: PersonEditDraft, person: MobilePerson): boolean {
  return emailKey(draft.email) !== emailKey(person.email);
}

/**
 * Whether the draft differs from the saved person.
 *
 * Used by both the edit panel's buttons and the screen's unsaved-changes
 * guard. While this lived inside the panel the screen couldn't see it, so back
 * navigation had no idea there was anything to lose; computing it twice would
 * be worse still, because then Cancel and the back button could disagree about
 * whether to ask.
 *
 * Text compares trimmed on both sides, since the save trims it: a saved value
 * with stray spaces would otherwise read as changed the moment the panel
 * opened, and trailing spaces typed into the notes as a change that saves
 * nothing.
 */
export function personDraftHasChanges(draft: PersonEditDraft, person: MobilePerson): boolean {
  const saved = makePersonDraft(person);
  const differs = (left: string, right: string) => left.trim() !== right.trim();

  return (
    nameKey(draft.firstName) !== nameKey(saved.firstName) ||
    nameKey(draft.lastName) !== nameKey(saved.lastName) ||
    draft.employmentType !== saved.employmentType ||
    comparablePhone(draft.phone) !== comparablePhone(saved.phone) ||
    personEmailChanged(draft, person) ||
    differs(draft.contactNotes, saved.contactNotes) ||
    draft.certificationId !== saved.certificationId ||
    !sameIds(draft.focusAreaIds, saved.focusAreaIds) ||
    !sameIds(draft.roleIds, saved.roleIds) ||
    !sameIds(draft.departmentIds, saved.departmentIds)
  );
}

/** What Add to schedule gives someone who has no scheduling attributes yet. */
export type ScheduleAssignmentsDraft = Pick<
  PersonEditDraft,
  "certificationId" | "focusAreaIds" | "roleIds"
>;

/** Compares the picked ids as sets, so a swap is a change and a reorder is not. */
export function scheduleAssignmentsChanged(
  draft: ScheduleAssignmentsDraft,
  person: Pick<MobilePerson, "certificationId" | "focusAreaIds" | "roleIds">,
): boolean {
  return (
    draft.certificationId !== person.certificationId ||
    !sameIds(draft.focusAreaIds, person.focusAreaIds) ||
    !sameIds(draft.roleIds, person.roleIds)
  );
}
