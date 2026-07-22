import { mobileRadii, mobileText, type MobileColors } from "../../../shared/theme/tokens";

type MobileOrgRole = "super_admin" | "admin" | "user" | null;
type OrgRole = NonNullable<MobileOrgRole>;
type HighlightedOrgRole = Extract<OrgRole, "super_admin" | "admin">;

export const MOBILE_ORG_ROLE_LABELS: Record<OrgRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

export function getHighlightedMobileOrgRole(
  role: MobileOrgRole | null | undefined,
): HighlightedOrgRole | null {
  return role === "super_admin" || role === "admin" ? role : null;
}

export function getMobileOrgRoleBadge(
  mobileColors: MobileColors,
  role: MobileOrgRole | null | undefined,
) {
  const highlightedRole = getHighlightedMobileOrgRole(role);
  if (!highlightedRole) {
    return null;
  }

  if (highlightedRole === "super_admin") {
    return {
      label: MOBILE_ORG_ROLE_LABELS[highlightedRole],
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
    label: MOBILE_ORG_ROLE_LABELS[highlightedRole],
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
