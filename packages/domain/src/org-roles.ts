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

/**
 * The star an elevated member carries beside their name in directory and
 * profile UI: gold for a Super Admin, blue for an Admin.
 */
export type OrgRoleInsignia = "gold" | "blue";

/**
 * The insignia for a role, or null for a plain user.
 *
 * Shared for the same reason the badge rule is: a gold star that means Super
 * Admin on web and Admin on mobile would be worse than no star. Styling stays
 * per-platform.
 */
export function getOrgRoleInsignia(
  role: OrgRole | string | null | undefined,
): OrgRoleInsignia | null {
  const highlighted = getHighlightedOrgRole(role);
  if (!highlighted) {
    return null;
  }

  return highlighted === "super_admin" ? "gold" : "blue";
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

/** One reading of the signed-in person's role in one organization. */
export interface OwnOrgRoleReading {
  orgId: string | null;
  role: string | null;
}

/**
 * The role the server now gives the signed-in person when an earlier reading
 * (their access token's claim, or what the app last showed) names another one
 * for the same organization; null when there is nothing to catch up on.
 *
 * A different organization is never a role change: a sandbox, an org switch or
 * an impersonation reads a different org on purpose.
 */
export function getOwnOrgRoleChange(
  current: OwnOrgRoleReading,
  earlier: OwnOrgRoleReading,
): OrgRole | null {
  if (!current.orgId || current.orgId !== earlier.orgId) return null;
  const role = current.role;
  if (role !== "super_admin" && role !== "admin" && role !== "user") return null;
  const earlierRole = earlier.role;
  if (earlierRole !== "super_admin" && earlierRole !== "admin" && earlierRole !== "user") {
    return null;
  }
  return role === earlierRole ? null : role;
}

/** What the signed-in person is told once their own app has caught up with a role change. */
export function getOwnOrgRoleChangedMessage(role: OrgRole): string {
  return `Your role changed to ${ORG_ROLE_LABELS[role]}, so what you can see has updated.`;
}

/**
 * Whether this person may give `role` through an invitation (F-238). Only a
 * Super Admin or Gridmaster gives an elevated tier: an invited Admin gets the
 * standard Admin permissions whatever the inviter holds, so an Admin trusted
 * only with staff records could otherwise mint themselves publish rights.
 */
export function canGrantOrgRole(
  actor: { isSuperAdmin: boolean; isGridmaster: boolean },
  role: OrgRole | string,
): boolean {
  return actor.isSuperAdmin || actor.isGridmaster || role === "user";
}

/** Why an invite can't give `role`, shown beside it where it's out of reach. */
export function getOrgRoleGrantRefusal(role: OrgRole | string): string {
  return role === "super_admin"
    ? "Only a Super Admin can invite someone as a Super Admin."
    : "Only a Super Admin can invite someone as an Admin.";
}
