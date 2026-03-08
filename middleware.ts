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
  admin: 3,
  scheduler: 2,
  supervisor: 1,
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

interface ProfileClaimsRow {
  org_id: string | null;
  platform_role: string | null;
  org_role: string | null;
  organizations?: { slug: string | null } | null;
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

  // Public routes — accessible without authentication
  if (
    pathname === "/" ||
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
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Verify JWT and read top-level custom claims - Requirement 11.4
  let claims: JWTClaims;
  try {
    if (process.env.SUPABASE_JWT_SECRET) {
      const { payload } = await jwtVerify(session.access_token, SUPABASE_JWT_SECRET);
      claims = payload as JWTClaims;
    } else {
      claims = decodeJwt(session.access_token) as JWTClaims;
    }
  } catch (err) {
    console.error("JWT verification failed:", err);
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Fallback path: if custom JWT claims are missing, resolve role/org
  // from the caller's profile so route guards still work.
  if (!claims.platform_role || !claims.org_role || !claims.org_id || !claims.org_slug) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, platform_role, org_role, organizations(slug)")
      .eq("id", session.user.id)
      .maybeSingle<ProfileClaimsRow>();

    if (profile) {
      claims = {
        platform_role: claims.platform_role ?? profile.platform_role ?? "none",
        org_role: claims.org_role ?? profile.org_role ?? "user",
        org_id: claims.org_id ?? profile.org_id ?? undefined,
        org_slug: claims.org_slug ?? profile.organizations?.slug ?? undefined,
      };
    }
  }

  // Calculate effective role - Requirement 11.1
  const effectiveRole = calculateEffectiveRole(claims);
  const level = getRoleLevel(effectiveRole);

  // Gridmaster subdomain check - Requirement 11.1
  if (subdomain === "gridmaster" && effectiveRole !== "gridmaster") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Keep org-scoped users on their organization subdomain.
  if (effectiveRole !== "gridmaster" && claims.org_slug) {
    const expectedHost = buildSubdomainHost(claims.org_slug, parsedHost);
    if (host !== expectedHost) {
      const url = new URL(req.url);
      url.host = expectedHost;
      return NextResponse.redirect(url);
    }
  }

  // Route guards - Requirements 11.2, 11.3

  // Redirect users below admin (level < 3) away from /settings
  if (pathname.startsWith("/settings") && level < 3) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // Redirect users below scheduler (level < 2) away from /schedule
  if (pathname.startsWith("/schedule") && level < 2) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Gridmaster-only admin route
  if (pathname.startsWith("/admin") && effectiveRole !== "gridmaster") {
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
