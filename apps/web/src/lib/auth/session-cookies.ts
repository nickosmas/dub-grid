import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import logger from "@/lib/logger";
import { requireSupabasePublishableKey, requireSupabaseUrl } from "@/lib/supabase-keys";
import { withTimeoutOrThrow } from "@/lib/with-timeout";

export interface SessionCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/** Bounded: past this, the browser sets the session itself, as it used to. */
const SESSION_COOKIE_TIMEOUT_MS = 2_000;

/**
 * The auth cookies the browser client would write for this session, written by
 * the server that just issued it. With them on the login response, the
 * navigation that follows is authenticated as soon as the response lands. The
 * browser's own setSession first re-reads the user from the auth server, a full
 * round trip that sat in front of every sign-in.
 *
 * Returns null when the auth server does not confirm the session in time; the
 * caller then leaves the browser to set it.
 */
export async function authCookiesForSession(
  req: NextRequest,
  session: { access_token: string; refresh_token: string },
): Promise<SessionCookie[] | null> {
  const cookies: SessionCookie[] = [];
  const client = createServerClient(requireSupabaseUrl(), requireSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookies.push(...cookiesToSet);
      },
    },
  });

  try {
    const { error } = await withTimeoutOrThrow(
      client.auth.setSession(session),
      SESSION_COOKIE_TIMEOUT_MS,
      "session cookies",
    );
    if (error) throw error;
  } catch (error) {
    logger.warn({ error }, "Writing sign-in session cookies failed; the browser will set them");
    return null;
  }
  return cookies.length > 0 ? cookies : null;
}
