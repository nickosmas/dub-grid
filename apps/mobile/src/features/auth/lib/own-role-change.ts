import { getOwnOrgRoleChange, type OrgRole, type OwnOrgRoleReading } from "@dubgrid/domain";
import type { MobileBootstrapResponse } from "@dubgrid/contracts";

/**
 * The signed-in person's role in the bootstrap's current organization, read
 * from their membership on the server. Null for a Gridmaster, whose access
 * comes from the platform role rather than a membership.
 */
export function readOwnOrgRole(bootstrap: MobileBootstrapResponse): OwnOrgRoleReading | null {
  const membership = bootstrap.memberships.find((entry) => entry.isCurrent);
  if (!membership || membership.platformRole === "gridmaster") return null;
  return { orgId: bootstrap.currentOrg.id, role: membership.orgRole };
}

export interface OwnRoleChangeDecision {
  /** The role to tell the person about, or null to say nothing. */
  announce: OrgRole | null;
  /** Whether the session should be refreshed so the token names the new role. */
  refreshToken: boolean;
}

/**
 * Whether a fresh bootstrap shows the person's own role changed.
 *
 * `shown` is what the app last showed this launch (a restored cache counts),
 * `token` the role the access token was issued with. A token that trails the
 * server on the first reading of a launch means the change happened while the
 * app was closed; after that the token alone is never announced again, so a
 * refresh that fails does not repeat the message on every bootstrap.
 */
export function decideOwnRoleChange(
  current: OwnOrgRoleReading,
  shown: OwnOrgRoleReading | null,
  token: OwnOrgRoleReading,
): OwnRoleChangeDecision {
  const tokenTrails = getOwnOrgRoleChange(current, token);
  const sinceShown = shown ? getOwnOrgRoleChange(current, shown) : tokenTrails;
  return { announce: sinceShown, refreshToken: tokenTrails !== null };
}
