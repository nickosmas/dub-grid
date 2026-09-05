/**
 * A member's role *within an organization* — distinct from `platform_role`
 * (where `gridmaster` lives). See RBAC_SYSTEM_DESIGN.md.
 */
export type OrgRole = "super_admin" | "admin" | "user";

/** Roles that get a visual badge in directory and profile UI. */
export type HighlightedOrgRole = Extract<OrgRole, "super_admin" | "admin">;

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  user: "User",
};

/**
 * The role to render a badge for, or null when the member is a plain user
 * (deliberately unbadged — badging everyone makes the badge meaningless).
 *
 * Shared so web and mobile can't drift on which roles are highlighted; the
 * badge *styling* stays per-platform.
 */
export function getHighlightedOrgRole(
  role: OrgRole | string | null | undefined,
): HighlightedOrgRole | null {
  return role === "super_admin" || role === "admin" ? role : null;
}

/** The glyph an elevated member's avatar carries in directory and profile UI. */
export type OrgRoleInsignia = "crown" | "star";

/**
 * The avatar insignia for a role, or null for a plain user.
 *
 * Shared for the same reason the badge rule is: a crown that means Super Admin
 * on web and Admin on mobile would be worse than no crown. Styling stays
 * per-platform.
 */
export function getOrgRoleInsignia(
  role: OrgRole | string | null | undefined,
): OrgRoleInsignia | null {
  const highlighted = getHighlightedOrgRole(role);
  if (!highlighted) {
    return null;
  }

  return highlighted === "super_admin" ? "crown" : "star";
}

/** Display label for a role, falling back to "User" for unknown values. */
export function getOrgRoleLabel(role: OrgRole | string | null | undefined): string {
  return ORG_ROLE_LABELS[role as OrgRole] ?? ORG_ROLE_LABELS.user;
}

/** Access tiers from most privileged to least, the order both directories offer. */
export const ORG_ROLE_PRIVILEGE_ORDER: OrgRole[] = ["super_admin", "admin", "user"];

const PRIVILEGE_RANK: Record<OrgRole, number> = {
  super_admin: 0,
  admin: 1,
  user: 2,
};

/**
 * The tier to treat a member as holding.
 *
 * Anyone without elevated access is a User, members with no account at all
 * included: no account means no privileges, which is what User already
 * describes. Filtering to User therefore returns everyone who is not an admin,
 * rather than stranding staff with no login in a fourth, unnameable bucket.
 */
export function getEffectiveOrgRole(role: OrgRole | string | null | undefined): OrgRole {
  return getHighlightedOrgRole(role) ?? "user";
}

/** Sort position for a member's access tier, most privileged first. */
export function getOrgRolePrivilegeRank(role: OrgRole | string | null | undefined): number {
  return PRIVILEGE_RANK[getEffectiveOrgRole(role)];
}
