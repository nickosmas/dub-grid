import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { parseHost, type ParsedHost } from "@/lib/subdomain";
import { lookupOrgBySlug } from "@/lib/org-lookup";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { THEME_COOKIE_NAME, resolveRequestTheme, withThemeParam } from "@/lib/theme-preference";
import { ORG_NOT_FOUND_PARAM } from "./constants";
import type { OrgLoginSeed } from "./OrgLogin";

// Each branch is its own dynamically-imported chunk so a visit to one
// subdomain's /login never ships (or hydrates) the other two flows' JS —
// e.g. landing on an org subdomain after the domain-selector redirect only
// downloads OrgLogin, not DomainSelector or GridmasterLogin.
const DomainSelector = dynamic(() => import("./DomainSelector"));
const OrgLogin = dynamic(() => import("./OrgLogin"));
const GridmasterLogin = dynamic(() => import("./GridmasterLogin"));

/**
 * The apex `/login` — the domain selector — for a request that arrived on a
 * subdomain. Host and port come from the incoming request rather than
 * `NEXT_PUBLIC_SITE_URL` so the target is always the same deployment the user
 * is already talking to, and it matches what OrgLogin's "Use a different
 * organization" button builds client-side.
 */
function apexLoginUrl(
  parsed: ParsedHost,
  forwardedProto: string | null,
  theme: string | undefined,
): string {
  // `x-forwarded-proto` is a bare scheme ("https"), unlike
  // `window.location.protocol` ("https:") — the colon belongs to the template,
  // not the value. Without it the URL isn't absolute, and Next quietly
  // downgrades the redirect to a meta-refresh plus a client re-render.
  const scheme =
    forwardedProto?.split(",")[0]?.trim() ||
    (parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost") ? "http" : "https");
  // Carry the theme, like every other deliberate origin hop in this flow: the
  // apex has its own localStorage, and in dev the `dg-theme` cookie isn't
  // shared between `sub.localhost` and `localhost` at all, so without the
  // param the user gets bounced into the other theme. `withThemeParam`
  // validates the value, so an arbitrary cookie can't malform the URL.
  return withThemeParam(
    `${scheme}://${parsed.rootDomain}${parsed.port}/login?${ORG_NOT_FOUND_PARAM}=1`,
    theme,
  );
}

// Reads the Host header server-side to pick the right flow before the first
// byte is sent, instead of deciding on the client after hydration (the
// previous version rendered nothing at all until a mount effect resolved
// window.location.host).
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const headersList = await headers();
  const params = (await searchParams) ?? {};
  const parsed = parseHost(headersList.get("host") ?? "");
  const { subdomain } = parsed;
  // Links that hop origins carry the theme. Resolving it from the request
  // rather than from next-themes on the client means the server HTML and the
  // first client render build the same hrefs, and a click before hydration
  // still hands the theme over.
  const theme = resolveRequestTheme(params.theme, (await cookies()).get(THEME_COOKIE_NAME)?.value);

  if (subdomain === "gridmaster") {
    return <GridmasterLogin initialTheme={theme} />;
  }
  if (subdomain) {
    // Resolve the organization here, not on the client, so the very first
    // paint says "Sign in to Calm Haven" rather than showing the raw slug and
    // swapping it a moment later. The lookup is Redis-cached for 24h, so this
    // is a single warm read on the request this page was already rendering
    // server-side — and it replaces a client round trip that used to run
    // after hydration.
    //
    // Same IP limit /api/validate-domain applies, because this is now the same
    // unauthenticated org lookup: without it, a flood of made-up subdomains
    // would reach Supabase once each (misses aren't cached) with nothing in
    // front of it — middleware doesn't rate-limit page requests. Prod-only, so
    // local dev pays no round trip.
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const { limited } = await checkRateLimit(apiLimiter, ip);
    const result = limited ? ({ status: "error" } as const) : await lookupOrgBySlug(subdomain);

    // There is no organization here, so there is nothing to sign in to — send
    // the user to the domain selector instead of rendering a sign-in page that
    // can only tell them it doesn't work. Knowing this server-side is what
    // makes the redirect possible at all: the client-resolved version had
    // already committed to the page by the time it found out.
    if (result.status === "not-found") {
      redirect(apexLoginUrl(parsed, headersList.get("x-forwarded-proto"), theme));
    }

    const seed: OrgLoginSeed =
      result.status === "found"
        ? { status: "found", name: result.org.name, suspended: Boolean(result.org.suspendedAt) }
        : result.status === "archived"
          ? { status: "deleted", name: result.org.name }
          : // Couldn't check (rate-limited, no service key locally, query
            // failed). Not the same as "not found" — the org probably does
            // exist, so keep the sign-in form and let the client re-ask.
            { status: "unresolved" };

    // The proxy sends a signed-in member here with one of these flags when it
    // finds their organization suspended or deleted mid-session (F-87).
    const lockout =
      params.deleted === "true" ? "deleted" : params.suspended === "true" ? "suspended" : null;

    return <OrgLogin orgSlug={subdomain} seed={seed} lockout={lockout} />;
  }
  return <DomainSelector />;
}
