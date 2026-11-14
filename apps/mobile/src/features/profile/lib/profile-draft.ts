import { normalizeOptionalUsPhone, type MobileProfileResponse } from "@dubgrid/contracts";
import { sameIds } from "../../../shared/lib/same-ids";

export type LinkedEmployee = NonNullable<MobileProfileResponse["linkedEmployee"]>;

export type ProfileDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  employmentType: LinkedEmployee["employmentType"];
  certificationId: number | null;
  focusAreaIds: number[];
  roleIds: number[];
  departmentIds: number[];
  contactNotes: string;
  requestNote: string;
  /**
   * The staff record version the draft was opened from, sent with the save so
   * a change made meanwhile is a conflict rather than quietly reverted.
   */
  baseVersion: number | null;
};

export function makeProfileDraft(
  profile: MobileProfileResponse,
  linkedEmployee: LinkedEmployee | null,
): ProfileDraft {
  return {
    firstName: profile.user.firstName ?? "",
    lastName: profile.user.lastName ?? "",
    email: profile.user.email ?? "",
    phone: linkedEmployee?.phone ?? "",
    employmentType: linkedEmployee?.employmentType ?? "full_time",
    certificationId: linkedEmployee?.certificationId ?? null,
    focusAreaIds: linkedEmployee?.focusAreaIds ?? [],
    roleIds: linkedEmployee?.roleIds ?? [],
    departmentIds: linkedEmployee?.departmentIds ?? [],
    contactNotes: linkedEmployee?.contactNotes ?? "",
    requestNote: "",
    baseVersion: linkedEmployee?.version ?? null,
  };
}

// The save sends names and phones in their normalized form, so a stored value
// is compared in that form too: a double space or a phone saved as
// 555-123-4567 is not an edit.
function nameKey(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function phoneKey(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  try {
    return normalizeOptionalUsPhone(trimmed);
  } catch {
    return trimmed;
  }
}

export function profileFirstNameChanged(draft: ProfileDraft, profile: MobileProfileResponse) {
  return nameKey(draft.firstName) !== nameKey(profile.user.firstName);
}

export function profileLastNameChanged(draft: ProfileDraft, profile: MobileProfileResponse) {
  return nameKey(draft.lastName) !== nameKey(profile.user.lastName);
}

export function profileNameChanged(draft: ProfileDraft, profile: MobileProfileResponse): boolean {
  return profileFirstNameChanged(draft, profile) || profileLastNameChanged(draft, profile);
}

export function profileEmailChanged(draft: ProfileDraft, profile: MobileProfileResponse): boolean {
  return draft.email.trim().toLowerCase() !== (profile.user.email ?? "").trim().toLowerCase();
}

export function profilePhoneChanged(
  draft: ProfileDraft,
  linkedEmployee: LinkedEmployee | null,
): boolean {
  return linkedEmployee != null && phoneKey(draft.phone) !== phoneKey(linkedEmployee.phone);
}

/**
 * Whether the work fields differ from the linked staff record. The save
 * decides from this whether the staff record is written, so it has to agree
 * with `profileDraftHasChanges` about what counts.
 */
export function profileWorkChanged(draft: ProfileDraft, linkedEmployee: LinkedEmployee): boolean {
  return (
    draft.employmentType !== linkedEmployee.employmentType ||
    draft.certificationId !== linkedEmployee.certificationId ||
    !sameIds(draft.focusAreaIds, linkedEmployee.focusAreaIds) ||
    !sameIds(draft.roleIds, linkedEmployee.roleIds) ||
    !sameIds(draft.departmentIds, linkedEmployee.departmentIds) ||
    draft.contactNotes.trim() !== (linkedEmployee.contactNotes ?? "").trim()
  );
}

/**
 * Whether the draft differs from what is saved.
 *
 * Used by both the edit panel's buttons and the screen's unsaved-changes
 * guard. While this lived inside the panel the screen couldn't see it, so back
 * navigation had no idea there was anything to lose; computing it twice would
 * be worse still, because then Cancel and the back button could disagree
 * about whether to ask.
 *
 * `requestNote` deliberately doesn't count, matching the Save button: the note
 * only ever accompanies a change, so on its own there is nothing to send.
 */
export function profileDraftHasChanges(
  draft: ProfileDraft,
  profile: MobileProfileResponse,
  linkedEmployee: LinkedEmployee | null,
): boolean {
  return (
    profileNameChanged(draft, profile) ||
    profileEmailChanged(draft, profile) ||
    profilePhoneChanged(draft, linkedEmployee) ||
    (linkedEmployee != null && profileWorkChanged(draft, linkedEmployee))
  );
}
