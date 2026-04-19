import { decodeJwt } from "jose";
import type { Session } from "@supabase/supabase-js";
import type { AdminPermissions } from "@/types";
import { buildPermissionContext, ROLE_LEVEL } from "./core";
import type { PermissionContext } from "./core";

export interface Permissions extends PermissionContext {
  atLeast: (role: string) => boolean;
}

export function buildPerms(
  role: string,
  orgId: string | null,
  isLoading: boolean,
  adminPerms?: AdminPermissions | null,
  isImpersonating = false,
): Permissions {
  const base = buildPermissionContext(role, orgId, adminPerms, {
    isImpersonating,
    isLoading,
  });
  return {
    ...base,
    atLeast: (r: string) => base.level >= (ROLE_LEVEL[r] ?? 0),
  };
}

export function extractJwtClaims(accessToken: string): {
  effectiveRole: string;
  orgId: string | null;
} {
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwt(accessToken) as Record<string, unknown>;
  } catch {
    return { effectiveRole: "user", orgId: null };
  }

  const platformRole = payload.platform_role as string | undefined;
  const orgRole = (payload.org_role as string) || "user";
  const orgId = (payload.org_id as string) || null;
  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : orgRole;

  return { effectiveRole, orgId };
}

const NO_PERMS: Permissions = buildPerms("user", null, false);

export function getPermissionsFromSession(session: Session | null): Permissions {
  if (!session?.access_token) return NO_PERMS;
  const { effectiveRole, orgId } = extractJwtClaims(session.access_token);
  return buildPerms(effectiveRole, orgId, false);
}
