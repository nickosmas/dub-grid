// proxy.ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, decodeJwt } from "jose";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSandboxFromCookie } from "@/lib/sandbox-cookie";
import { endImpersonationOnEscape, verifyImpersonationSession } from "@/lib/impersonation-server";
import { evaluateOrganizationBillingAccess } from "@dubgrid/domain";
import { evaluateMfaClaimState } from "@dubgrid/authz";
import { buildSubdomainHost, parseHost } from "@/lib/subdomain";
import { THEME_COOKIE_NAME, withThemeParam } from "@/lib/theme-preference";
import { cacheSet, cacheThrough, CacheKey, TTL } from "@/lib/cache";
import { Timer } from "@/lib/server-timing";
import { getSupabaseJwks } from "@/lib/auth/verify-token";
import * as Sentry from "@/lib/sentry";
import { getSupabaseSecretKey, requireSupabasePublishableKey } from "./lib/supabase-keys";
import { getSupabaseUrl, requireSupabaseUrl } from "@/lib/supabase-keys";

/**
 * Vercel Edge Proxy for RBAC Route Protection
 *
 * This middleware implements route-level access control at the CDN edge:
 * - Uses @supabase/ssr createServerClient to read the session from cookies
 *   (handles the sb-<project-ref>-auth-token format and multi-chunk cookies)
 * - Verifies the access token JWT via Supabase's JWKS endpoint (supports ES256)
 * - Parses platform_role and org_role top-level claims from the JWT
 * - Calculates effective role based on role hierarchy
 * - Blocks unauthorized access to protected routes
 * - Injects verified role and org_id into request headers
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

/**
 * The JWKS keyset now lives in lib/auth/verify-token.ts so middleware and the
 * API routes share one keyset and one per-isolate cache rather than each
 * fetching Supabase's public keys separately.
 */

/**
 * Per-isolate memo in front of the org-access lookup below.
 *
 * `cacheThrough` still costs a Redis GET on a hit, and this check runs on every
 * authenticated navigation — including each RSC request — so a user clicking
 * around paid a network round trip per page. Redis is not always nearby:
 * measured at 340-670ms from one development machine.
 *
 * This is an access-revocation path, so the added staleness is stated plainly:
 * the org-access answer was already accepted as up to TTL.MIDDLEWARE (30s) old,
 * and this makes it at most 30s + MW_ORG_ACCESS_MEMO_MS. That sits inside the
 * window this check exists to cover in the first place — a pre-suspension JWT
 * remains usable for up to an hour, which is the whole reason for the check.
 */
const MW_ORG_ACCESS_MEMO_MS = 10_000;
type MwOrgAccess = {
  suspended_at: string | null;
  archived_at: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
} | null;
const mwOrgAccessMemo = new Map<string, { value: MwOrgAccess; expiresAt: number }>();

/** Test seam: clears the in-process org-access memo between cases. */
export function resetMiddlewareOrgAccessMemo(): void {
  mwOrgAccessMemo.clear();
}

function redirectWithCookies(url: URL, source: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

async function readOrgAccess(
  orgId: string,
  load: () => Promise<MwOrgAccess>,
  refresh = false,
): Promise<MwOrgAccess> {
  const now = Date.now();
  if (!refresh) {
    const memoized = mwOrgAccessMemo.get(orgId);
    if (memoized && memoized.expiresAt > now) return memoized.value;
  }

  const value = refresh
    ? await load()
    : await cacheThrough(CacheKey.mwOrgAccess(orgId), TTL.MIDDLEWARE, load);
  // The read is RLS-scoped but the key is per organization: an empty result is
  // one caller's lost membership, not the organization's state, so it must
  // never be memoized for the next caller. (Redis stores it as a miss already.)
  if (value === null) return value;
  mwOrgAccessMemo.set(orgId, { value, expiresAt: now + MW_ORG_ACCESS_MEMO_MS });
  if (refresh) void cacheSet(CacheKey.mwOrgAccess(orgId), value, TTL.MIDDLEWARE);
  return value;
}

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
  session_id?: string;
  platform_role?: string;
  org_role?: string;
  org_id?: string;
  org_slug?: string;
  aal?: string;
  mfa_enrolled?: boolean;
}

/**
 * Calculates the effective role based on platform_role and org_role.
 * Gridmaster platform_role takes precedence over org_role.
 */
export function calculateEffectiveRole(claims: JWTClaims): string {
  return claims.platform_role === "gridmaster" ? "gridmaster" : (claims.org_role ?? "user");
}

/**
 * Gets the numeric level for a role from the hierarchy.
 */
export function getRoleLevel(role: string): number {
  return ROLE_HIERARCHY[role] ?? 0;
}

export async function proxy(req: NextRequest) {
  const timer = new Timer();
  const host = req.headers.get("host") ?? "";
  const pathname = req.nextUrl.pathname;
  const parsedHost = parseHost(host);
  const subdomain = parsedHost.subdomain;

  // CSP. Two script-src policies (SECURITY_AUDIT.md F-4):
  //  - Static/public pages (marketing, login, auth flows) are pre-rendered and
  //    can't carry a per-request nonce, so they keep 'unsafe-inline'. These pages
  //    hold no user data and have no injection sink.
  //  - The authenticated app is rendered dynamically (its layouts/pages set
  //    `export const dynamic = "force-dynamic"` for exactly this reason), so in
  //    production it drops 'unsafe-inline' for a per-request nonce + 'strict-dynamic'.
  //    Next.js stamps the nonce onto its inline bootstrap scripts (read from this
  //    request CSP header) and the nonced bundle loads analytics by propagation.
  // In development both policies stay on 'unsafe-inline' so HMR / React Refresh work.
  const isDev = process.env.NODE_ENV === "development";
  const nonce = isDev
    ? ""
    : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const analyticsSrc = "https://va.vercel-scripts.com";
  // Google Places for OrganizationLocationFields (google-maps.ts appends the
  // loader script itself). Listed explicitly so the address autocomplete works
  // under both policies rather than only where 'strict-dynamic' happens to
  // extend trust to a bundle-created script tag.
  const mapsSrc = "https://maps.googleapis.com https://maps.gstatic.com";
  // @vercel/analytics/next injects its own bootstrap inline script (not via
  // next/script), so it never picks up the per-request nonce and its trust
  // never chains from strict-dynamic — the browser blocks it outright on
  // every authenticated page load. The script's content is fixed for a given
  // package version, so a hash source (CSP's own suggested remedy) allowlists
  // exactly that script without weakening strict-dynamic for anything else.
  // Recompute this if `@vercel/analytics` is upgraded and starts failing again.
  const analyticsInlineScriptHash = "'sha256-N+t4k5q6GzjvL1q+njUuAvlUpYZ9j7Yv2/Lax5Edtak='";
  const devScriptExtras = isDev ? "'unsafe-eval'" : "";
  // Gated on NEXT_PUBLIC_SUPABASE_URL being a loopback address, not on isDev —
  // a *production build* (`next start`) run against local Supabase (e.g. the
  // e2e CI job) needs this too, and a real deployment's Supabase URL is never
  // 127.0.0.1/localhost, so this never loosens the CSP for an actual prod
  // deployment. Without it, the client-side Supabase SDK's own calls (session
  // refresh, getUser, etc.) are silently blocked by CSP after a successful
  // server-side login, leaving the user stuck on the login page.
  const isLocalSupabase = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(
    getSupabaseUrl() ?? "",
  );
  const devConnectExtras = isLocalSupabase
    ? "http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321"
    : "";
  const buildCsp = (scriptSrc: string) =>
    `
    default-src 'self';
    script-src ${scriptSrc};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self';
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.stripe.com https://*.posthog.com https://us.i.posthog.com https://eu.i.posthog.com https://maps.googleapis.com ${devConnectExtras};
    frame-ancestors 'self';
    object-src 'none';
    base-uri 'none';
    form-action 'self';
    ${isDev ? "" : "upgrade-insecure-requests;"}
  `
      .replace(/\s{2,}/g, " ")
      .trim();

  // Static/public pages keep 'unsafe-inline'.
  const contentSecurityPolicyHeaderValue = buildCsp(
    `'self' 'unsafe-inline' ${devScriptExtras} ${analyticsSrc} ${mapsSrc}`,
  );
  // Authenticated app: nonce + 'strict-dynamic' in production (its pages are
  // force-dynamic, so Next can stamp the nonce); 'unsafe-inline' in dev.
  const dynamicCspHeaderValue = isDev
    ? contentSecurityPolicyHeaderValue
    : buildCsp(
        `'self' 'nonce-${nonce}' 'strict-dynamic' ${analyticsSrc} ${mapsSrc} ${analyticsInlineScriptHash}`,
      );

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);

  // Marketing content is canonical on the apex. Organization and Gridmaster
  // application routes remain on their respective wildcard subdomains.
  if (subdomain) {
    const isMarketingPage =
      pathname === "/" ||
      pathname === "/privacy" ||
      pathname === "/terms" ||
      pathname === "/request-demo";
    if (isMarketingPage) {
      const url = new URL(req.url);
      url.pathname = pathname;
      url.host = `${parsedHost.rootDomain}${parsedHost.port}`;
      const res = NextResponse.redirect(url);
      res.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);
      return res;
    }
  }

  // Public routes — accessible without authentication.
  // Note: /api routes are also excluded at the matcher level (line 400),
  // so the /api check here is a safety net for if the matcher changes.
  if (
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/goodbye" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/cookie-policy" ||
    pathname === "/accept-invite" ||
    pathname === "/request-demo" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/verify-email" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api")
  ) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue);
    return res;
  }

  // Past the public/static branches: this is the authenticated, force-dynamic
  // app. Swap in the nonce-based CSP so Next.js stamps the nonce onto its inline
  // scripts (it reads the nonce from this request CSP header) and we drop
  // 'unsafe-inline'.
  requestHeaders.set("Content-Security-Policy", dynamicCspHeaderValue);

  // Create a mutable response so @supabase/ssr can refresh session cookies
  // and pass the modified request headers forward for Next.js SSR hydration
  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Apply CSP to the response sent to the browser
  res.headers.set("Content-Security-Policy", dynamicCspHeaderValue);

  // Use @supabase/ssr to read the session from cookies. This correctly handles
  // the sb-<project-ref>-auth-token cookie format and multi-chunk cookie
  // reconstruction used by @supabase/ssr browser clients.
  const supabase = createServerClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { session },
  } = await supabase.auth.getSession();

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
  let claimsVerified = false;
  try {
    const jwks = getSupabaseJwks();
    if (jwks) {
      const { payload } = await timer.time("jwt_verify", () =>
        jwtVerify(session.access_token, jwks),
      );
      claims = payload as JWTClaims;
      claimsVerified = true;
    } else {
      claims = decodeJwt(session.access_token) as JWTClaims;
    }
  } catch (e) {
    Sentry.captureException(e, { extra: { context: "middleware-jwt-verify" } });
    try {
      claims = decodeJwt(session.access_token) as JWTClaims;
      // Don't trust gridmaster from unverified tokens — a forged JWT could
      // claim platform-level access. Org-level roles (super_admin/admin) are
      // safe to pass through because RLS enforces all data access anyway.
      if (claims.platform_role === "gridmaster") {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("error", "session_invalid");
        return NextResponse.redirect(loginUrl);
      }
    } catch (e) {
      Sentry.captureException(e, { extra: { context: "middleware-jwt-decode-fallback" } });
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (claims.platform_role === "gridmaster" && !claimsVerified) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "session_invalid");
    return NextResponse.redirect(loginUrl);
  }

  // An enrolled account that has not answered its challenge goes back to the
  // login screen, which runs the challenge and hands the session on. The API
  // refuses the same token (api-auth), so this only decides whether the shell
  // renders before the user is told to finish signing in.
  // Only the actionable state redirects. An absent claim cannot be answered by
  // a challenge, so bouncing it here would loop; it falls through to the
  // missing-claims path below, and migration 041 denies its data at the
  // policy layer regardless of what this shell renders.
  if (claimsVerified && evaluateMfaClaimState(claims) === "challenge-required") {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "mfa_required");
    return NextResponse.redirect(loginUrl);
  }

  // Fallback path: if custom JWT claims are missing, resolve role/org
  // from the caller's profile so route guards still work.
  // Gridmaster legitimately has no org_id/org_slug — skip fallback for them.
  let isGridmaster = claims.platform_role === "gridmaster";
  const subdomainMismatch =
    !isGridmaster && subdomain && subdomain !== "gridmaster" && claims.org_slug !== subdomain;

  if (
    !claims.platform_role ||
    !claims.org_role ||
    (!isGridmaster && (!claims.org_id || !claims.org_slug)) ||
    subdomainMismatch
  ) {
    const userId = session.user.id;

    try {
      // 1 & 2 are independent — membership doesn't depend on profile's result,
      // it only overrides the fallback default profile provides below — so
      // fetch both Redis-cached lookups concurrently instead of serially.
      const membershipSubdomain = subdomain && subdomain !== "gridmaster" ? subdomain : null;

      const [profile, membership] = await Promise.all([
        timer.time("mw_profile", () =>
          cacheThrough(CacheKey.mwProfile(userId), TTL.MIDDLEWARE, async () => {
            const { data } = await supabase
              .from("profiles")
              .select("platform_role, org_id")
              .eq("id", userId)
              .maybeSingle();
            return data;
          }),
        ),
        membershipSubdomain
          ? timer.time("mw_membership", () =>
              cacheThrough(
                CacheKey.mwMembership(userId, membershipSubdomain),
                TTL.MIDDLEWARE,
                async () => {
                  const { data } = await supabase
                    .from("organization_memberships")
                    .select("org_role, org_id, organizations!inner(slug)")
                    .eq("user_id", userId)
                    .is("archived_at", null)
                    .eq("organizations.slug", membershipSubdomain)
                    .maybeSingle<{
                      org_role: string;
                      org_id: string;
                      organizations: { slug: string };
                    }>();
                  return data;
                },
              ),
            )
          : Promise.resolve(null),
      ]);

      // Resolve the user's organization role on the requested subdomain.
      let resolvedOrgRole = "user";
      let resolvedOrgId = profile?.org_id;
      let resolvedOrgSlug: string | undefined = undefined;

      if (membershipSubdomain) {
        if (membership) {
          resolvedOrgRole = membership.org_role;
          resolvedOrgId = membership.org_id;
          resolvedOrgSlug = membership.organizations?.slug;
        } else if (subdomainMismatch) {
          return NextResponse.redirect(new URL("/login", req.url));
        }
      }

      claims = {
        platform_role: claims.platform_role ?? profile?.platform_role ?? "none",
        org_role: claims.org_role ?? resolvedOrgRole,
        org_id: claims.org_id ?? resolvedOrgId ?? undefined,
        org_slug: claims.org_slug ?? resolvedOrgSlug ?? undefined,
      };
    } catch (e) {
      Sentry.captureException(e, { extra: { context: "middleware-claims-fallback" } });
      // DB/cache unavailable — proceed with JWT claims as-is.
      // RLS enforces real data security; middleware guards are best-effort.
    }
  }

  // The fallback above may have resolved the platform role from the profile.
  isGridmaster = claims.platform_role === "gridmaster";

  // Calculate effective role - Requirement 11.1
  let effectiveRole = calculateEffectiveRole(claims);
  let isImpersonating = false;

  // ── Impersonation context override ───────────────────────────────────
  // When a gridmaster has an active impersonation cookie, override the
  // org context and effective role to match the target user. This makes
  // route guards and headers reflect the impersonated identity.
  // The gridmaster's JWT is unchanged — RLS still sees full access.
  if (isGridmaster) {
    const rawCookie = req.headers.get("cookie") ?? "";
    const impCookiePrefix = "dubgrid-impersonation=";
    const impCookie = rawCookie.split("; ").find((c) => c.startsWith(impCookiePrefix));

    if (impCookie) {
      try {
        const impData = JSON.parse(decodeURIComponent(impCookie.slice(impCookiePrefix.length)));
        const expired = !impData.expiresAt || new Date(impData.expiresAt).getTime() <= Date.now();

        if (expired) {
          // Clear expired cookie
          res.cookies.set("dubgrid-impersonation", "", {
            path: "/",
            maxAge: 0,
          });
        } else if (pathname.startsWith("/gridmaster")) {
          // Safety escape: navigating to /gridmaster auto-ends impersonation.
          // End the row as well as the cookie, or the session keeps counting
          // as active and blocks the next start until it expires (F-72).
          res.cookies.set("dubgrid-impersonation", "", {
            path: "/",
            maxAge: 0,
          });
          if (typeof impData.sessionId === "string") {
            await timer.time("mw_impersonation_escape", () =>
              endImpersonationOnEscape(supabase, impData.sessionId),
            );
          }
        } else {
          // The cookie is client-writable and populated mostly from
          // client-held state, not start_impersonation's return value — cross
          // -check its sessionId against the authoritative impersonation_
          // sessions row before trusting targetOrgId/targetUserId, the same
          // way the sandbox cookie is re-verified against the DB below.
          const supabaseUrl3 = getSupabaseUrl();
          const serviceKey3 = getSupabaseSecretKey();
          const verified =
            typeof impData.sessionId === "string" &&
            typeof claims.session_id === "string" &&
            supabaseUrl3 &&
            serviceKey3
              ? await timer.time("mw_impersonation_verify", () =>
                  verifyImpersonationSession(
                    createClient(supabaseUrl3, serviceKey3, {
                      auth: { autoRefreshToken: false, persistSession: false },
                    }),
                    impData.sessionId,
                    session.user.id,
                    claims.session_id as string,
                  ),
                )
              : null;

          if (verified) {
            // Active impersonation — override context to target user. Use
            // the DB-verified org id, not the cookie's copy; org_slug/
            // org_role are display-only for route gating during
            // impersonation and stay sourced from the cookie.
            isImpersonating = true;
            claims = {
              ...claims,
              org_id: verified.targetOrgId,
              org_slug: verified.targetOrgSlug,
              org_role: verified.targetOrgRole,
            };
            effectiveRole = verified.targetOrgRole;
          } else {
            // No matching active session — the cookie doesn't correspond to
            // a real, still-active impersonation. Clear it rather than
            // trusting any of its fields.
            res.cookies.set("dubgrid-impersonation", "", {
              path: "/",
              maxAge: 0,
            });
          }
        }
      } catch {
        // Malformed cookie — clear it
        res.cookies.set("dubgrid-impersonation", "", {
          path: "/",
          maxAge: 0,
        });
      }
    }
  }

  // ── Sandbox mode override ──────────────────────────────────────────────
  // When a user has an active sandbox cookie, override the org context to
  // the sandbox org id WITHOUT touching the JWT or the current subdomain.
  // The user stays signed in on their real organization subdomain while every
  // org_id-scoped read/write is routed to the sandbox copy.
  let isInSandbox = false;
  if (!isImpersonating && session?.user?.id) {
    const sandboxCookie = getSandboxFromCookie(req.headers.get("cookie") ?? "");
    if (sandboxCookie) {
      if (
        sandboxCookie.userId !== session?.user?.id ||
        sandboxCookie.sessionId !== claims.session_id
      ) {
        // Cookie was set for a different user — clear it.
        res.cookies.set("dubgrid-sandbox", "", { path: "/", maxAge: 0 });
      } else {
        try {
          const supabaseUrl2 = getSupabaseUrl();
          const serviceKey = getSupabaseSecretKey();
          if (supabaseUrl2 && serviceKey) {
            const svc = createClient(supabaseUrl2, serviceKey, {
              auth: { autoRefreshToken: false, persistSession: false },
            });
            const { data } = await timer.time("mw_sandbox", async () =>
              svc
                .from("organizations")
                .select("id, slug")
                .eq("id", sandboxCookie.sandboxOrgId)
                .eq("workspace_kind", "sandbox")
                .eq("sandbox_owner_user_id", session?.user?.id)
                .eq("sandbox_owner_session_id", claims.session_id)
                .is("archived_at", null)
                .maybeSingle(),
            );
            if (data) {
              isInSandbox = true;
              claims = {
                ...claims,
                org_id: data.id,
                // Keep claims.org_slug so the user stays on their real
                // organization subdomain.
              };
            }
            // No row → either the sandbox was deleted server-side or the
            // verification query transiently failed. Either way, fail open:
            // do not override here. The /api/organization/bootstrap and
            // /api/test-sandbox handlers do their own ownership checks via
            // the service client, so a stale cookie cannot leak data even
            // if middleware doesn't override. The user clears the cookie
            // explicitly by clicking Exit, not by us guessing.
          }
        } catch (e) {
          Sentry.captureException(e, {
            extra: { context: "middleware-sandbox-verify" },
          });
        }
      }
    }
  }

  // Only platform gridmasters may use the reserved Gridmaster host.
  if (subdomain === "gridmaster" && effectiveRole !== "gridmaster" && !isImpersonating) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Gridmasters use their dedicated wildcard subdomain on every authenticated
  // route. This also fixes a Gridmaster login that began from the apex host.
  if (isGridmaster && !isImpersonating && subdomain !== "gridmaster") {
    const url = new URL(req.url);
    url.host = buildSubdomainHost("gridmaster", parsedHost);
    // In dev the theme cookie is host-only, so the hop hands the theme over in
    // the URL, as the subdomain login page does when it bounces to the apex.
    const theme = req.cookies.get(THEME_COOKIE_NAME)?.value;
    return redirectWithCookies(new URL(withThemeParam(url.toString(), theme)), res);
  }

  // Keep regular organization users on the host named by their active-org
  // claim. Gridmasters move to their dedicated host below.
  if (!isImpersonating && effectiveRole !== "gridmaster" && claims.org_slug) {
    const expectedHost = buildSubdomainHost(claims.org_slug, parsedHost);
    if (host !== expectedHost) {
      const url = new URL(req.url);
      url.host = expectedHost;
      return redirectWithCookies(url, res);
    }
  }

  // ── Organization access check ───────────────────────────────────────────
  // The JWT hook filters out suspended orgs on token refresh, but a user
  // with a pre-suspension JWT can still access the app until it expires
  // (up to 1 hour). This check catches that window.
  // Billing follows the same pattern: active trials and grace periods keep
  // regular users out of billing, but a hard lock blocks organization access.
  // Skip for gridmasters (they manage suspended orgs) and impersonation.
  if (claims.org_id && !isGridmaster && !isImpersonating) {
    try {
      const orgAccess = await timer.time("mw_org_access", () =>
        readOrgAccess(
          claims.org_id!,
          async () => {
            const { data, error } = await supabase
              .from("organizations")
              .select("suspended_at, archived_at, subscription_status, trial_ends_at")
              .eq("id", claims.org_id!)
              .maybeSingle();
            // A lookup failure is an outage, handled below as best-effort; an
            // empty result is a verdict, so the two must not look the same.
            if (error) throw error;
            return (data as MwOrgAccess) ?? null;
          },
          pathname === "/billing-required",
        ),
      );

      // The read runs as the caller under RLS, so no row means the organization
      // is no longer visible to them: the membership was archived (removal,
      // termination) after this token was issued. Without this, the null row
      // read as a pending trial and sent the person to the billing gate.
      if (orgAccess === null) {
        return NextResponse.redirect(new URL("/login", req.url));
      }

      // A deleted (archived) org revokes access just like a suspended one. A
      // user with a pre-deletion JWT can still hit the app until it clears, so
      // catch that window here.
      if (orgAccess?.archived_at !== null && orgAccess?.archived_at !== undefined) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("deleted", "true");
        return NextResponse.redirect(loginUrl);
      }

      if (orgAccess?.suspended_at !== null && orgAccess?.suspended_at !== undefined) {
        const loginUrl = new URL("/login", req.url);
        loginUrl.searchParams.set("suspended", "true");
        return NextResponse.redirect(loginUrl);
      }

      const billingAccess = evaluateOrganizationBillingAccess({
        subscriptionStatus: orgAccess?.subscription_status ?? null,
        trialEndsAt: orgAccess?.trial_ends_at ?? null,
      });

      const canRecoverBilling = getRoleLevel(effectiveRole) >= ROLE_HIERARCHY.super_admin;

      if (billingAccess.isLocked) {
        const isBillingRecoveryPath =
          pathname === "/settings" && req.nextUrl.searchParams.get("section") === "org-billing";

        if (canRecoverBilling && !isBillingRecoveryPath) {
          const billingUrl = new URL("/settings", req.url);
          billingUrl.searchParams.set("section", "org-billing");
          return NextResponse.redirect(billingUrl);
        }

        if (!canRecoverBilling && pathname !== "/billing-required") {
          return NextResponse.redirect(new URL("/billing-required", req.url));
        }
      } else if (billingAccess.state === "trial_pending" && !canRecoverBilling) {
        // Trial clock has not started yet (no super_admin has signed in). Hold
        // non-super-admins on the setup screen until a super_admin starts it.
        if (pathname !== "/billing-required") {
          return NextResponse.redirect(new URL("/billing-required", req.url));
        }
      } else if (pathname === "/billing-required") {
        return NextResponse.redirect(new URL("/schedule", req.url));
      }
    } catch (e) {
      Sentry.captureException(e, { extra: { context: "middleware-org-access-check" } });
      // DB/cache unavailable — proceed without blocking.
      // RLS + JWT hook are the primary enforcement; this is defense-in-depth.
    }
  }

  // Route guards - Requirements 11.2, 11.3
  // People is accessible to authenticated org members, with mutations gated deeper
  // by canManageEmployees. Settings is reserved for admins, super admins, and
  // gridmasters; page-level guards still enforce per-section permissions.

  if (pathname.startsWith("/settings") && getRoleLevel(effectiveRole) < ROLE_HIERARCHY.admin) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // Gridmaster-only route — always allow actual gridmasters (even during impersonation,
  // since /gridmaster access auto-ends impersonation above)
  if (pathname.startsWith("/gridmaster") && !isGridmaster) {
    return NextResponse.redirect(new URL("/schedule", req.url));
  }

  // Inject headers - Requirement 11.5
  res.headers.set("x-dubgrid-role", effectiveRole);
  res.headers.set("x-dubgrid-org-id", claims.org_id ?? "");
  if (claims.org_slug) {
    res.headers.set("x-dubgrid-org-slug", claims.org_slug);
  }
  if (isImpersonating) {
    res.headers.set("x-dubgrid-impersonating", "true");
  }
  if (isInSandbox) {
    res.headers.set("x-dubgrid-sandbox", "true");
  }
  timer.applyTo(res.headers);
  return res;
}

export const config = {
  matcher: [
    "/((?!_next|favicon\\.ico|api|monitoring|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|woff2?|ttf|eot|txt)$).*)",
  ],
};
