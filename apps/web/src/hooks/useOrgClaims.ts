"use client";

import { useMemo } from "react";
import { decodeJwt } from "jose";
import { useAuth } from "@/components/AuthProvider";

export interface OrgClaims {
  orgId: string | null;
  orgSlug: string | null;
  /** Organization display name, baked into the JWT by custom_access_token_hook. */
  orgName: string | null;
  orgRole: string | null;
  platformRole: string | null;
}

const EMPTY: OrgClaims = {
  orgId: null,
  orgSlug: null,
  orgName: null,
  orgRole: null,
  platformRole: null,
};

/**
 * Reads org context directly from the current session's JWT claims, so the
 * org name/slug are available synchronously on first render — no bootstrap
 * fetch, no flash. `orgName` is null for tokens minted before the claim was
 * added (callers should fall back to the fetched org until those refresh).
 */
export function useOrgClaims(): OrgClaims {
  const { session } = useAuth();
  const token = session?.access_token;

  return useMemo(() => {
    if (!token) return EMPTY;
    try {
      const c = decodeJwt(token);
      const str = (v: unknown) => (typeof v === "string" && v ? v : null);
      return {
        orgId: str(c.org_id),
        orgSlug: str(c.org_slug),
        orgName: str(c.org_name),
        orgRole: str(c.org_role),
        platformRole: str(c.platform_role),
      };
    } catch {
      return EMPTY;
    }
  }, [token]);
}
