import { NextRequest, NextResponse } from "next/server";
import { validateCsrfOrigin } from "@/lib/csrf";
import { extractBearerToken } from "@/lib/auth/verify-token";
import {
  createRequestSupabaseClient,
  requireLiveAuthenticatedSession,
  requireSensitiveActionAuth,
} from "@/lib/api-auth";
import { API_ERRORS } from "@dubgrid/client-errors";
import {
  BULK_SIGN_OUT_FAILURE_MESSAGE,
  hasFreshRecoveryProof,
  parseSignOutBody,
  revokeBulkSessions,
  revokeLocalSession,
} from "@/lib/auth/session-sign-out";

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

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // No body is fine — "local" is the default.
  }
  const { scope, recoveryCompletion } = parseSignOutBody(body);

  if (scope !== "local") {
    const auth = recoveryCompletion
      ? await requireLiveAuthenticatedSession(req)
      : await requireSensitiveActionAuth(req);
    if ("response" in auth) return auth.response;
    if (recoveryCompletion && !hasFreshRecoveryProof(auth.claims)) {
      return NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 });
    }
    if (!auth.sessionId) {
      return NextResponse.json(
        { error: "Please sign in again before managing devices." },
        { status: 401 },
      );
    }
    try {
      await revokeBulkSessions({
        accessToken: auth.session.access_token,
        userId: auth.user.id,
        sessionId: auth.sessionId,
        scope,
        recoveryCompletion,
        orgId: auth.claims && typeof auth.claims.org_id === "string" ? auth.claims.org_id : null,
      });
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // A partial failure is not success and must not trigger automatic replay.
      return NextResponse.json({ error: BULK_SIGN_OUT_FAILURE_MESSAGE }, { status: 503 });
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
  await revokeLocalSession(accessToken);
  return NextResponse.json({ success: true });
}
