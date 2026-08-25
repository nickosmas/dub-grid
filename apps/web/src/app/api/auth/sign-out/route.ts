import { NextRequest, NextResponse } from "next/server";
import { validateCsrfOrigin } from "@/lib/csrf";
import { extractBearerToken, verifyAccessToken } from "@/lib/auth/verify-token";
import { revokeAllUserSessions, revokeSession } from "@/lib/auth/revocation";
import { createRequestSupabaseClient } from "@/lib/api-auth";
import * as Sentry from "@/lib/sentry";

export const dynamic = "force-dynamic";

/**
 * Marks the caller's session revoked on sign-out.
 *
 * Sign-out used to be entirely client-side (`supabase.auth.signOut()`), which
 * clears the browser's copy of the tokens but leaves the access token itself
 * valid until it expires. Now that API routes verify tokens locally instead of
 * asking Supabase Auth on every request, that gap would be reachable — a token
 * copied before sign-out would keep working for the rest of its lifetime. This
 * closes it.
 *
 * Best-effort by design: the client calls this before its own sign-out and
 * must not be blocked from signing out if it fails.
 *
 * `scope` mirrors Supabase's own: "local" ends this session, "global" ends
 * every session the user has.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  let scope: "local" | "global" = "local";
  try {
    const body = await req.json();
    if (body?.scope === "global") scope = "global";
  } catch {
    // No body is fine — "local" is the default.
  }

  // Resolve the token the same way authenticated routes do, but never 401:
  // a caller whose session is already gone has nothing left to revoke and
  // should still be allowed to complete sign-out.
  let accessToken = extractBearerToken(req);
  if (!accessToken) {
    try {
      const supabase = createRequestSupabaseClient(req);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = session?.access_token ?? null;
    } catch {
      accessToken = null;
    }
  }
  if (!accessToken) return NextResponse.json({ success: true });

  const verified = await verifyAccessToken(accessToken);
  if (!verified) return NextResponse.json({ success: true });

  try {
    if (scope === "global") {
      await revokeAllUserSessions(verified.userId);
    } else if (verified.sessionId) {
      await revokeSession(verified.sessionId);
    } else {
      // A token with no session_id claim can't be revoked individually.
      // Falling back to the user-wide watermark is the safe reading of
      // "sign this caller out".
      await revokeAllUserSessions(verified.userId);
    }
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "sign-out-revocation" } });
  }

  return NextResponse.json({ success: true });
}
