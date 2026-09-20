import {
  ORG_ROLE_LABELS,
  getHighlightedOrgRole,
  type OrgRole,
} from "@dubgrid/domain";
import {
  mobileRadii,
  mobilePillOverflow,
  mobileSpace,
  mobileText,
  mobileTextWeighted,
  type MobileColors,
} from "../../../shared/theme/tokens";

type MobileOrgRole = OrgRole | null;

// The labels and the which-roles-get-badged rule are shared with web via
// `@dubgrid/domain`; only the styling below is mobile-specific.
export { ORG_ROLE_LABELS, getHighlightedOrgRole };

export function getMobileOrgRoleBadge(
  mobileColors: MobileColors,
  role: MobileOrgRole | null | undefined,
) {
  const highlightedRole = getHighlightedOrgRole(role);
  if (!highlightedRole) {
    return null;
  }

  // A list row prints one thing, not two: the pill carries the star and the
  // tier's name together, so a scan for stars and a read of the label are the
  // same glance. The detail hero shows the star alone.
  if (highlightedRole === "super_admin") {
    return {
      label: ORG_ROLE_LABELS[highlightedRole],
      tone: "warning" as const,
      containerStyle: {
        ...mobilePillOverflow.displayContainer,
        alignItems: "center" as const,
        backgroundColor: mobileColors.warningSoft,
        borderColor: mobileColors.warningBorder,
        borderRadius: mobileRadii.pill,
        borderWidth: 1,
        flexDirection: "row" as const,
        gap: 4,
        paddingHorizontal: mobileSpace.sm,
        paddingVertical: 4,
      },
      textStyle: {
        ...mobileTextWeighted("caption", "bold"),
        ...mobilePillOverflow.displayText,
        color: mobileColors.warningText,
      },
    };
  }

  return {
    label: ORG_ROLE_LABELS[highlightedRole],
    tone: "brand" as const,
    containerStyle: {
      ...mobilePillOverflow.displayContainer,
      alignItems: "center" as const,
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      flexDirection: "row" as const,
      gap: 4,
      paddingHorizontal: mobileSpace.sm,
      paddingVertical: 4,
    },
    textStyle: {
      ...mobileTextWeighted("caption", "bold"),
      ...mobilePillOverflow.displayText,
      color: mobileColors.brand,
    },
  };
}
