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
 * "Away", "Suspended" or "Offboarded". Active people show none.
 */
export function getMobileStatusPill(
  mobileColors: MobileColors,
  person: Pick<MobilePerson, "status" | "awayUntil"> & { suspendedAt?: string | null },
) {
  const suspended = person.status === "active" && Boolean(person.suspendedAt);
  if (person.status === "active" && !suspended) return null;
  const away = person.status === "inactive";
  const tone = suspended
    ? {
        bg: mobileColors.dangerSoft,
        border: mobileColors.dangerBorder,
        text: mobileColors.dangerText,
      }
    : away
      ? {
          bg: mobileColors.warningSoft,
          border: mobileColors.warningBorder,
          text: mobileColors.warningText,
        }
      : {
          bg: mobileColors.controlNeutralBg,
          border: mobileColors.controlNeutralBg,
          text: mobileColors.textSecondary,
        };
  return {
    label: describeEmploymentStatus(person.status, person.awayUntil, person.suspendedAt),
    containerStyle: {
      ...mobilePillOverflow.displayContainer,
      alignItems: "center" as const,
      backgroundColor: tone.bg,
      borderColor: tone.border,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: 4,
    },
    textStyle: {
      ...mobileTextWeighted("caption", "bold"),
      ...mobileTabularText,
      ...mobilePillOverflow.displayText,
      color: tone.text,
    },
  };
}
