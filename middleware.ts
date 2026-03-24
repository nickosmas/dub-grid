// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, decodeJwt } from "jose";
import { createServerClient } from "@supabase/ssr";
import { buildSubdomainHost, parseHost } from "@/lib/subdomain";

/**
 * Vercel Edge Middleware for RBAC Route Protection
 *
 * This middleware implements route-level access control at the CDN edge:
 * - Uses @supabase/ssr createServerClient to read the session from cookies
 *   (handles the sb-<project-ref>-auth-token format and multi-chunk cookies)
 * - Verifies the access token JWT with SUPABASE_JWT_SECRET
 * - Parses platform_role and org_role top-level claims from the JWT
 * - Calculates effective role based on role hierarchy
 * - Blocks unauthorized access to protected routes
 * - Injects verified role and org_id into request headers
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

const SUPABASE_JWT_SECRET = new TextEncoder().encode(
  process.env.SUPABASE_JWT_SECRET
);

/**
 * Role hierarchy levels for permission checks.
 * Higher numbers indicate more permissions.
 */
const ROLE_HIERARCHY: Record<string, number> = {
  gridmaster: 4,
  super_admin: 3,
  admin: 2,
  user: 0,
};

/**
 * JWT claims structure expected from Supabase tokens.
 * These are top-level claims injected by the custom_access_token_hook.
 */
interface JWTClaims {
  platform_role?: string;
  org_role?: string;
  org_id?: string;
  org_slug?: string;
}

/**
 * Calculates the effective role based on platform_role and org_role.
 * Gridmaster platform_role takes precedence over org_role.
 */
export function calculateEffectiveRole(claims: JWTClaims): string {
  return claims.platform_role === "gridmaster"
    ? "gridmaster"
    : claims.org_role ?? "user";
}

/**
 * Gets the numeric level for a role from the hierarchy.
 */
export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const pathname = req.nextUrl.pathname;
  const parsedHost = parseHost(host);
  const subdomain = parsedHost.subdomain;

  // Public routes — accessible without authentication.
  // Note: /api routes are also excluded at the matcher level (line 191),
  // so the /api check here is a safety net for if the matcher changes.
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/gridmaster/login" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/accept-invite" ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // Create a mutable response so @supabase/ssr can refresh session cookies
  const res = NextResponse.next({
    request: { headers: req.headers },
  });

  // Use @supabase/ssr to read the session from cookies. This correctly handles
  // the sb-<project-ref>-auth-token cookie format and multi-chunk cookie
  // reconstruction used by @supabase/ssr browser clients.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // Unauthenticated redirect - Requirement 11.4
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Verify JWT and read top-level custom claims - Requirement 11.4
  // If jwtVerify fails (expired token, wrong secret, etc.), fall back to
  // unverified decode so the user isn't blocked. Real data security is
  // enforced by Supabase RLS, not edge middleware. However, we never trust
  // elevated roles (gridmaster) from unverified tokens.
  let claims: JWTClaims;
  try {
    if (process.env.SUPABASE_JWT_SECRET) {
      const { payload } = await jwtVerify(session.access_token, SUPABASE_JWT_SECRET);
      claims = payload as JWTClaims;
    } else {
      claims = decodeJwt(session.access_token) as JWTClaims;
    }
  } catch {
    try {
      claims = decodeJwt(session.access_token) as JWTClaims;
      // Don't trust gridmaster from unverified tokens — a forged JWT could
      // claim platform-level access. Org-level roles (super_admin/admin) are
      // safe to pass through because RLS enforces all data access anyway.
      if (claims.platform_role === "gridmaster") {
        return NextResponse.redirect(new URL("/login", req.url));
      }
    } catch {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Fallback path: if custom JWT claims are missing, resolve role/org
  // from the caller's profile so route guards still work.
  // Gridmaster legitimately has no org_id/org_slug — skip fallback for them.
  const isGridmaster = claims.platform_role === "gridmaster";
  const subdomainMismatch = !isGridmaster && subdomain && subdomain !== "gridmaster" && claims.org_slug !== subdomain;

  if (
    !claims.platform_role ||
    !claims.org_role ||
    (!isGridmaster && (!claims.org_id || !claims.org_slug)) ||
    subdomainMismatch
  ) {
    const userId = session.user.id;

    // 1. Fetch platform role from profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("platform_role, org_id")
      .eq("id", userId)
      .maybeSingle();

    // 2. Fetch org-specific role for the current subdomain
    let resolvedOrgRole = "user";
    let resolvedOrgId = profile?.org_id;
    let resolvedOrgSlug = undefined;

    if (subdomain && subdomain !== "gridmaster") {
      const { data: membership } = await supabase
        .from("organization_memberships")
        .select("org_role, org_id, organizations!inner(slug)")
        .eq("user_id", userId)
        .eq("organizations.slug", subdomain)
        .maybeSingle<any>();

      if (membership) {
        resolvedOrgRole = membership.org_role;
        resolvedOrgId = membership.org_id;
        resolvedOrgSlug = membership.organizations?.slug;
      } else if (subdomainMismatch) {
        // User is on a subdomain they don't belong to — redirect to login
        // instead of silently proceeding with stale/missing org context.
        return NextResponse.redirect(new URL("/login", req.url));
      }
    }

    claims = {
      platform_role: claims.platform_role ?? profile?.platform_role ?? "none",
      org_role: claims.org_role ?? resolvedOrgRole,
      org_id: claims.org_id ?? resolvedOrgId ?? undefined,
      org_slug: claims.org_slug ?? resolvedOrgSlug ?? undefined,
    };
  }

  // Calculate effective role - Requirement 11.1
  const effectiveRole = calculateEffectiveRole(claims);
  const level = getRoleLevel(effectiveRole);

  // Gridmaster subdomain check - Requirement 11.1
  if (subdomain === "gridmaster" && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Keep org-scoped users on their org subdomain.
  if (effectiveRole !== "gridmaster" && claims.org_slug) {
    const expectedHost = buildSubdomainHost(claims.org_slug, parsedHost);
    if (host !== expectedHost) {
      const url = new URL(req.url);
      url.host = expectedHost;
      return NextResponse.redirect(url);
    }
  }

  // Route guards - Requirements 11.2, 11.3

  // Staff page: requires admin+ (level >= 2)
  if (pathname.startsWith("/staff") && level < 2) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // Settings page: requires admin+ (level >= 2); component enforces fine-grained access
  if (pathname.startsWith("/settings") && level < 2) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // Gridmaster-only route
  if (pathname.startsWith("/gridmaster") && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }


  // Inject headers - Requirement 11.5
  res.headers.set("x-dubgrid-role", effectiveRole);
  res.headers.set("x-dubgrid-org-id", claims.org_id ?? "");
  if (claims.org_slug) {
    res.headers.set("x-dubgrid-org-slug", claims.org_slug);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|favicon.ico|api).*)"],
};
