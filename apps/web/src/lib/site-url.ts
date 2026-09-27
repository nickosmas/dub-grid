import { clientEnv } from "@/lib/env";

/**
 * The host DubGrid actually serves. https://dubgrid.com answers 307 to www, so
 * a canonical URL, sitemap entry or robots directive naming the apex sends
 * every client through a redirect first.
 */
export const CANONICAL_SITE_URL = "https://www.dubgrid.com";

/** The public origin for metadata and crawler-facing URLs, overridable per deployment. */
export function siteBaseUrl(): string {
  // `||`, not `??`: an env var present but empty must fall back rather than
  // reach `new URL("")`.
  return clientEnv?.NEXT_PUBLIC_SITE_URL || CANONICAL_SITE_URL;
}
