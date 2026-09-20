import {
  ORG_ROLE_LABELS,
  getHighlightedOrgRole,
  getOrgRoleLabel,
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

/**
 * Which access badge a hero prints, with no styling attached.
 *
 * `ProfileHero` owns the pill itself, so a hero only ever needed the label and
 * the tone — the styled factory below is for the rows that draw their own pill
 * (the People list). Unlike that one this never returns null: a hero badges
 * every tier, User included, because on a page about one person the access
 * level is a fact about them rather than a highlight on a list.
 */
export function getMobileOrgRoleHeroBadge(role: MobileOrgRole | null | undefined): {
  label: string;
  tone: "brand" | "warning";
} {
  return {
    label: getOrgRoleLabel(role),
    tone: getHighlightedOrgRole(role) === "super_admin" ? "warning" : "brand",
  };
}

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
  // same glance. The detail hero keeps them apart, where the pill is a control.
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
