// src/hooks/usePermissions.ts
import { useEffect, useState } from "react";
import { decodeJwt } from "jose";
import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const ROLE_LEVEL: Record<string, number> = {
  gridmaster: 4,
  admin: 3,
  scheduler: 2,
  supervisor: 1,
  user: 0,
};

export interface Permissions {
  role: string;
  orgId: string | null;
  level: number;
  isLoading: boolean;
  isGridmaster: boolean;
  canManageOrg: boolean;
  canEditSchedule: boolean;
  canAddNotes: boolean;
  canRead: boolean;
  atLeast: (role: string) => boolean;
}

/**
 * Extracts permissions from the JWT access token.
 * Reads top-level custom claims (platform_role, org_role, org_id) injected by
 * the custom_access_token_hook — not app_metadata, which is a nested object
 * inside the JWT and does not contain these custom claims.
 */
export function getPermissionsFromSession(session: Session | null): Permissions {
  const noPerms: Permissions = {
    role: "user",
    orgId: null,
    level: 0,
    isLoading: false,
    isGridmaster: false,
    canManageOrg: false,
    canEditSchedule: false,
    canAddNotes: false,
    canRead: true,
    atLeast: () => false,
  };

  if (!session?.access_token) return noPerms;

  let payload: Record<string, unknown>;
  try {
    payload = decodeJwt(session.access_token) as Record<string, unknown>;
  } catch {
    return noPerms;
  }

  const platformRole = (payload.platform_role as string | undefined) || (session.user?.app_metadata?.platform_role as string | undefined);
  const orgRole = (payload.org_role as string) || (session.user?.app_metadata?.org_role as string) || "user";
  const orgId = (payload.org_id as string) || (session.user?.app_metadata?.org_id as string) || null;

  console.log("dg_perms_debug:", {
    sessionAppMetadata: session.user?.app_metadata,
    payload,
    platformRole,
    orgRole,
    orgId
  });

  const effectiveRole = platformRole === "gridmaster" ? "gridmaster" : orgRole;
  const level = ROLE_LEVEL[effectiveRole] ?? 0;

  return {
    role: effectiveRole,
    orgId,
    level,
    isLoading: false,
    isGridmaster: level >= 4,
    canManageOrg: level >= 3,
    canEditSchedule: level >= 2,
    canAddNotes: level >= 1,
    canRead: level >= 0,
    atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
  };
}

export function usePermissions(): Permissions {
  const [session, setSession] = useState<Session | null>(null);
  const [dbFallback, setDbFallback] = useState<{ orgRole: string, orgId: string | null, platformRole: string } | null>(() => {
    try {
      if (typeof window !== "undefined") {
        const cached = sessionStorage.getItem("dg_perms_cache");
        if (cached) return JSON.parse(cached);
      }
    } catch {
      // ignore
    }
    return null;
  });

  // If we already have a cached fallback, we can start with isLoading = false
  // to prevent any UI flashing. We'll still fetch in the background to ensure
  // it's up to date.
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window !== "undefined") {
      return !sessionStorage.getItem("dg_perms_cache");
    }
    return true;
  });

  useEffect(() => {
    let mounted = true;

    async function loadSessionAndFallback(currentSession: Session | null) {
      if (!mounted) return;
      setSession(currentSession);

      const perms = getPermissionsFromSession(currentSession);

      // Only run the db query if we actually need the fallback (user role without admin/scheduler/supervisor claims)
      if (currentSession?.user?.id && perms.role === "user") {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('org_role, org_id, platform_role')
            .eq('id', currentSession.user.id)
            .single();

          if (mounted && data) {
            const fallbackConfig = {
              orgRole: data.org_role,
              orgId: data.org_id,
              platformRole: data.platform_role
            };
            setDbFallback(fallbackConfig);
            sessionStorage.setItem("dg_perms_cache", JSON.stringify(fallbackConfig));
          }
        } catch (err) {
          console.error("Failed to load DB fallback permissions:", err);
        }
      } else if (mounted) {
        setDbFallback(null);
        sessionStorage.removeItem("dg_perms_cache");
      }

      if (mounted) {
        setIsLoading(false);
      }
    }

    // 1. Initial Load
    // `supabase.auth.getSession()` handles the very first hydration, especially for Next.js SSR
    // but onAuthStateChange's INITIAL_SESSION event will often fire concurrently.
    // We only want to set loading to true if we're actually transitioning auth states.
    supabase.auth.getSession().then(({ data: { session: initSession } }: { data: { session: Session | null } }) => {
      loadSessionAndFallback(initSession);
    });

    // 2. Auth State Changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: string, authSession: Session | null) => {
      // Ignore INITIAL_SESSION because `getSession` already handles the mount phase,
      // avoiding a double-fetch flicker.
      if (event === "INITIAL_SESSION") return;

      // Re-trigger loading state when auth fundamentally changes if we weren't already loading
      setIsLoading(true);
      loadSessionAndFallback(authSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const perms = getPermissionsFromSession(session);

  if (perms.role === "user" && dbFallback) {
    const effectiveRole = dbFallback.platformRole === "gridmaster" ? "gridmaster" : dbFallback.orgRole;
    const level = ROLE_LEVEL[effectiveRole] ?? 0;

    return {
      role: effectiveRole,
      orgId: dbFallback.orgId,
      level,
      isLoading,
      isGridmaster: level >= 4,
      canManageOrg: level >= 3,
      canEditSchedule: level >= 2,
      canAddNotes: level >= 1,
      canRead: level >= 0,
      atLeast: (r: string) => level >= (ROLE_LEVEL[r] ?? 0),
    };
  }

  return { ...perms, isLoading };
}
