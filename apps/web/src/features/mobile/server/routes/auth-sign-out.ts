import { NextResponse, type NextRequest } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { extractMobileBearerToken } from "@dubgrid/mobile-api-core";
import { isSessionRevoked } from "@/lib/auth/revocation";
import {
  BULK_SIGN_OUT_FAILURE_MESSAGE,
  hasFreshRecoveryProof,
  parseSignOutBody,
  revokeBulkSessions,
  revokeLocalSession,
} from "@/lib/auth/session-sign-out";
import { verifyAccessToken } from "@/lib/auth/verify-token";
import { getServiceClient } from "@/lib/supabase-service";
import { requireMobileSensitiveActionAuth } from "../auth";

const NO_STORE = { "Cache-Control": "no-store" };

interface BulkCaller {
  accessToken: string;
  userId: string;
  sessionId: string;
  orgId: string | null;
}

function expired() {
  return NextResponse.json(
    { error: "Please sign in again before managing devices." },
    { status: 401 },
  );
}

/**
 * A recovery session is new and may not name an organization yet, so the full
 * mobile context (which requires one) would refuse it. Its fresh OTP proof is
 * what authorizes the sign-out, checked against a live, unrevoked user.
 */
async function requireRecoveryCaller(
  req: NextRequest,
): Promise<BulkCaller | { response: NextResponse }> {
  const accessToken = extractMobileBearerToken(req.headers.get("authorization"));
  if (!accessToken) return { response: expired() };
  const verified = await verifyAccessToken(accessToken);
  if (!verified?.sessionId) return { response: expired() };
  if (await isSessionRevoked(verified)) return { response: expired() };

  const { data, error } = await getServiceClient().auth.getUser(accessToken);
  if (error || data.user?.id !== verified.userId) return { response: expired() };
  if (!hasFreshRecoveryProof(verified.claims)) {
    return { response: NextResponse.json({ error: API_ERRORS.FORBIDDEN }, { status: 403 }) };
  }

  const orgId = verified.claims.org_id;
  return {
    accessToken,
    userId: verified.userId,
    sessionId: verified.sessionId,
    orgId: typeof orgId === "string" ? orgId : null,
  };
}

async function requireAssuredCaller(
  req: NextRequest,
): Promise<BulkCaller | { response: NextResponse }> {
  const auth = await requireMobileSensitiveActionAuth(req);
  if ("response" in auth) return auth;
  const sessionId = auth.claims.session_id;
  if (typeof sessionId !== "string" || !sessionId) return { response: expired() };
  return {
    accessToken: auth.accessToken,
    userId: auth.user.id,
    sessionId,
    orgId: auth.currentOrg.id,
  };
}

/**
 * The bearer-token twin of `/api/auth/sign-out`. API routes verify mobile JWTs
 * locally, so a provider sign-out alone leaves a copied access token working
 * until it expires; the app revocation markers written here close that gap.
 *
 * Local sign-out never needs fresh proof. Other-device and every-device
 * sign-out need live sensitive-action assurance, except when completing a
 * password recovery, whose fresh OTP proof stands in for it.
 */
export async function POST(req: NextRequest) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // No body means a local sign-out.
  }
  const { scope, recoveryCompletion, passwordChange } = parseSignOutBody(body);

  if (scope === "local") {
    await revokeLocalSession(extractMobileBearerToken(req.headers.get("authorization")));
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  }

  const caller = recoveryCompletion
    ? await requireRecoveryCaller(req)
    : await requireAssuredCaller(req);
  if ("response" in caller) return caller.response;

  try {
    await revokeBulkSessions({ ...caller, scope, recoveryCompletion, passwordChange });
    return NextResponse.json({ success: true }, { headers: NO_STORE });
  } catch {
    // A partial failure is not success and must not trigger automatic replay.
    return NextResponse.json({ error: BULK_SIGN_OUT_FAILURE_MESSAGE }, { status: 503 });
  }
}
