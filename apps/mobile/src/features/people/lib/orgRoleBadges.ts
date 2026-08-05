import { ORG_ROLE_LABELS, getHighlightedOrgRole, type OrgRole } from "@dubgrid/domain";
import { mobileRadii, mobileText, type MobileColors } from "../../../shared/theme/tokens";

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

  if (highlightedRole === "super_admin") {
    return {
      label: ORG_ROLE_LABELS[highlightedRole],
      tone: "warning" as const,
      containerStyle: {
        alignItems: "center" as const,
        backgroundColor: mobileColors.warningSoft,
        borderColor: mobileColors.warningBorder,
        borderRadius: mobileRadii.pill,
        borderWidth: 1,
        flexDirection: "row" as const,
        paddingHorizontal: 9,
        paddingVertical: 4,
      },
      textStyle: {
        ...mobileText.caption,
        color: mobileColors.warningText,
        fontWeight: "700" as const,
      },
    };
  }

  return {
    label: ORG_ROLE_LABELS[highlightedRole],
    tone: "brand" as const,
    containerStyle: {
      alignItems: "center" as const,
      backgroundColor: mobileColors.brandSoft,
      borderColor: mobileColors.brandBorder,
      borderRadius: mobileRadii.pill,
      borderWidth: 1,
      flexDirection: "row" as const,
      paddingHorizontal: 9,
      paddingVertical: 4,
    },
    textStyle: {
      ...mobileText.caption,
      color: mobileColors.brand,
      fontWeight: "700" as const,
    },
  };
}
