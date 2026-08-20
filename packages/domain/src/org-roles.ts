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

/** Display label for a role, falling back to "User" for unknown values. */
export function getOrgRoleLabel(role: OrgRole | string | null | undefined): string {
  return ORG_ROLE_LABELS[role as OrgRole] ?? ORG_ROLE_LABELS.user;
}
