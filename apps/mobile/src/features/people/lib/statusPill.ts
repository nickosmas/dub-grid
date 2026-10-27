import { describeEmploymentStatus } from "@dubgrid/domain";
import type { MobilePerson } from "@dubgrid/contracts";
import {
  mobilePillOverflow,
  mobileRadii,
  mobileSpace,
  mobileTabularText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

/**
 * The status pill a People row shows for anyone not Active: "Away until Jan 4",
 * "Away" or "Archived", in the tones web uses. Active people show none.
 */
export function getMobileStatusPill(
  mobileColors: MobileColors,
  person: Pick<MobilePerson, "status" | "awayUntil">,
) {
  if (person.status === "active") return null;
  const away = person.status === "inactive";
  return {
    label: describeEmploymentStatus(person.status, person.awayUntil),
    containerStyle: {
      ...mobilePillOverflow.displayContainer,
      alignItems: "center" as const,
      backgroundColor: away ? mobileColors.warningSoft : mobileColors.controlNeutralBg,
      borderColor: away ? mobileColors.warningBorder : mobileColors.controlNeutralBg,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: 4,
    },
    textStyle: {
      ...mobileTextWeighted("caption", "bold"),
      ...mobileTabularText,
      ...mobilePillOverflow.displayText,
      color: away ? mobileColors.warningText : mobileColors.textSecondary,
    },
  };
}
