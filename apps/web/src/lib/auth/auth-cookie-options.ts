import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * The session cookies' flags, stated rather than left to the library's
 * defaults: Lax, and Secure whenever the page is served over https. Local
 * http keeps working without Secure.
 */
export function authCookieOptions(protocol: string): CookieOptionsWithName {
  return { sameSite: "lax", secure: protocol === "https:" };
}
