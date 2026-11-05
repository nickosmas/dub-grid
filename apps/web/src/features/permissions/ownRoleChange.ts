import { getOwnOrgRoleChange, type OrgRole, type OwnOrgRoleReading } from "@dubgrid/domain";
import { extractJwtClaims } from "./shared";

export interface OwnRoleCatchUpDeps {
  /** Refreshes the browser session and answers the new access token. */
  refreshSession: () => Promise<string | null>;
  onCaughtUp: (role: OrgRole) => void;
}

// One attempt per user, org and role for the life of the page: usePermissions
// mounts in many places at once, and a token that somehow keeps the old claim
// must not refresh in a loop.
const attempted = new Set<string>();

/** Test seam. */
export function resetOwnRoleCatchUp(): void {
  attempted.clear();
}

/**
 * When the server gives the signed-in person a different role than their
 * token names, refresh the session so the access-token hook issues the new
 * claim, which the proxy's Settings gate and every claim reader follow. The
 * person is told only once the new token agrees, so a membership that ended
 * (whose refresh drops the organization) is never announced as a role.
 */
export async function catchUpOwnRoleChange(
  userId: string,
  server: OwnOrgRoleReading,
  token: OwnOrgRoleReading,
  deps: OwnRoleCatchUpDeps,
): Promise<OrgRole | null> {
  const role = getOwnOrgRoleChange(server, token);
  if (!role) return null;
  const key = `${userId}:${server.orgId}:${role}`;
  if (attempted.has(key)) return null;
  attempted.add(key);

  let accessToken: string | null;
  try {
    accessToken = await deps.refreshSession();
  } catch {
    // Offline or a blip: the next permissions read tries again.
    attempted.delete(key);
    return null;
  }
  if (!accessToken) return null;
  const fresh = extractJwtClaims(accessToken);
  if (fresh.orgId !== server.orgId || fresh.effectiveRole !== role) return null;
  deps.onCaughtUp(role);
  return role;
}
