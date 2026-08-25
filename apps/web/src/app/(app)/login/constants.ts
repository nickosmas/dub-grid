/**
 * Shared by both sides of the login flow, so it lives outside `shared.tsx` —
 * that module is `"use client"`, and app/login/page.tsx is a Server Component.
 */

/**
 * Set by the subdomain `/login` when that subdomain has no organization: it
 * redirects to the apex domain selector rather than rendering a sign-in page
 * for an org that doesn't exist (see page.tsx), and this tells the selector to
 * say why. Only a flag — the slug itself is deliberately not echoed back,
 * since it came from an attacker-controllable Host header.
 */
export const ORG_NOT_FOUND_PARAM = "org_not_found";

export const ORG_NOT_FOUND_MESSAGE =
  "No organization found for that subdomain. Please check and try again.";
