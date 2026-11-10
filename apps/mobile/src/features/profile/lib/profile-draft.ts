import type { MobileProfileResponse } from "@dubgrid/contracts";
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
  };
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
  const saved = makeProfileDraft(profile, linkedEmployee);

  return (
    draft.firstName.trim() !== saved.firstName.trim() ||
    draft.lastName.trim() !== saved.lastName.trim() ||
    draft.email.trim().toLowerCase() !== saved.email.trim().toLowerCase() ||
    (linkedEmployee != null &&
      (draft.phone.trim() !== saved.phone.trim() || profileWorkChanged(draft, linkedEmployee)))
  );
}
