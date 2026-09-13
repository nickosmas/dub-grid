import { NextRequest, NextResponse } from "next/server";
import { validateCsrfOrigin } from "@/lib/csrf";
import { extractBearerToken, verifyAccessToken } from "@/lib/auth/verify-token";
import {
  revokeAllUserSessions,
  revokeOtherUserSessions,
  revokeSession,
} from "@/lib/auth/revocation";
import {
  createRequestSupabaseClient,
  createTokenScopedClient,
  requireSensitiveActionAuth,
} from "@/lib/api-auth";
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
 * Local sign-out is best-effort and never requires fresh proof. Bulk sign-out
 * must pass live sensitive-action assurance before any provider or app mutation.
 *
 * `scope` mirrors Supabase: "local", "others", or "global".
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  let scope: "local" | "others" | "global" = "local";
  try {
    const body = await req.json();
    if (body?.scope === "global" || body?.scope === "others") scope = body.scope;
  } catch {
    // No body is fine — "local" is the default.
  }

  if (scope !== "local") {
    const auth = await requireSensitiveActionAuth(req);
    if ("response" in auth) return auth.response;
    if (!auth.sessionId) {
      return NextResponse.json(
        { error: "Please sign in again before managing devices." },
        { status: 401 },
      );
    }
    try {
      // The SDK admin transport accepts the caller's JWT here, not a service
      // credential. Use precisely the token whose assurance was just checked.
      const token = auth.session.access_token;
      const { error } = await createTokenScopedClient(token).auth.admin.signOut(token, scope);
      if (error) throw new Error("Provider sign-out failed");
      if (scope === "global") await revokeAllUserSessions(auth.user.id);
      else await revokeOtherUserSessions(auth.user.id, auth.sessionId);
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // A partial failure is not success and must not trigger automatic replay.
      return NextResponse.json(
        {
          error:
            "We couldn't finish signing out those devices. Check your sessions before trying again.",
        },
        { status: 503 },
      );
    }
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
    if (verified.sessionId) {
      await revokeSession(verified.sessionId);
    }
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "sign-out-revocation" } });
  }

  return NextResponse.json({ success: true });
}
