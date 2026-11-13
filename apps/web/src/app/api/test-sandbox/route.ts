import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithTokenClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { canUseTestSandbox } from "@/lib/sandbox-access";
import { getServiceClient } from "@/lib/supabase-service";
import {
  SANDBOX_COOKIE_NAME,
  SANDBOX_OPEN_ELSEWHERE_CODE,
  encodeSandboxCookieValue,
} from "@/lib/sandbox-cookie";
import {
  createSandboxForUser,
  deleteSandboxForUser,
  findActiveSandboxForUser,
  findSandboxFromOtherSession,
} from "@/features/test-sandbox/server";
import { API_ERRORS, DEFAULT_ERROR_FALLBACK } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { formatClientErrorMessage } from "@/lib/client-facing";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  // replaceExisting: the person saw that a sandbox is open in another session
  // and chose to discard it. Without it, Enter refuses rather than deleting.
  z.object({ action: z.literal("enter"), replaceExisting: z.boolean().optional() }),
  z.object({ action: z.literal("exit") }),
  // Reset = wipe and re-create. Used by the banner's Reset button so the
  // user can discard accumulated sandbox changes and start with a fresh
  // clone of the source org.
  z.object({ action: z.literal("reset") }),
]);

// One week — long enough that browser restarts don't kick the user out of
// sandbox mode. The cookie is still cleared explicitly on Exit, so this is
// purely about durability across normal tab/window churn.
const SANDBOX_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getClaimOrgId(claims: { org_id?: unknown }): string | null {
  return typeof claims.org_id === "string" && claims.org_id.length > 0 ? claims.org_id : null;
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // The token's own claims, not the sandbox-rewritten ones. Exit has to work
  // while the sandbox cookie is stale (the rewriting helper refuses such a
  // request outright), and Enter takes its source organization from the real
  // session rather than from a sandbox that is already open.
  const auth = await requireAuthenticatedUserWithTokenClaims(req);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
  }

  const serviceClient = getServiceClient();

  try {
    if (parsed.data.action === "exit") {
      // Delete every sandbox owned by this user. Don't rely on the cookie
      // — if the cookie's stale or missing we still want a clean exit so
      // orphans can't get re-attached on the next Enter.
      await deleteSandboxForUser({
        serviceClient,
        actor: auth.user,
      });
      const response = NextResponse.json({ success: true });
      response.cookies.set(SANDBOX_COOKIE_NAME, "", { path: "/", maxAge: 0 });
      return response;
    }

    // action === "enter" or "reset". Both clone the source org, which is
    // far more expensive than exit — rate-limit them (per user) so a client
    // can't spam reset and hammer the clone path. Exit is intentionally not
    // throttled: a user must always be able to leave sandbox mode.
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, auth.user.id);
    if (misconfigured) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: API_ERRORS.RATE_LIMITED },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds(reset)) },
        },
      );
    }

    const isReset = parsed.data.action === "reset";
    const existing = await findActiveSandboxForUser(serviceClient, auth.user.id, auth.sessionId);

    // Enter starts from this verified session's organization claim. Reset
    // starts from the source recorded on the current session's authoritative
    // sandbox row, never from the globally mutable profiles.org_id fallback.
    const sourceOrgId = isReset ? (existing?.sourceOrgId ?? null) : getClaimOrgId(auth.claims);
    if (!sourceOrgId) {
      return NextResponse.json(
        { error: "Pick an organization before entering sandbox mode." },
        { status: 400 },
      );
    }

    // Mirrors Header.tsx's client-side canOpenSandbox gate. Read the caller's
    // live role in the source org rather than the token's org_role claim,
    // which trails a demotion until the session refreshes.
    if (!(await canUseTestSandbox(serviceClient, auth.user.id, sourceOrgId))) {
      return NextResponse.json(
        { error: "You don't have permission to use sandbox mode." },
        { status: 403 },
      );
    }
    // A sandbox open in another session would be discarded below. Ask first:
    // the person may still be working in it in another window or device.
    const replaceExisting = parsed.data.action === "enter" && parsed.data.replaceExisting === true;
    if (!isReset && !existing && !replaceExisting) {
      const elsewhere = await findSandboxFromOtherSession(
        serviceClient,
        auth.user.id,
        auth.sessionId,
      );
      if (elsewhere) {
        return NextResponse.json(
          {
            error:
              "You already have a sandbox open in another window or device. Starting one here closes it and discards its changes.",
            code: SANDBOX_OPEN_ELSEWHERE_CODE,
            startedAt: elsewhere.startedAt,
          },
          { status: 409 },
        );
      }
    }

    // For "enter": reuse the existing sandbox if there is one (typical case is
    // the user re-clicking enter from another tab and expecting their
    // in-progress work back). For "reset": ignore it — we recreate below.
    // One sandbox is retained per user. A sandbox from another browser session
    // is invalid for this request and is removed before this session creates
    // its own, so stale state cannot silently migrate between sessions.
    // A sandbox this session cloned from another organization (before an
    // organization switch) is not reusable: its source is not the one just
    // checked, and reusing it answered 200 and then refused every request.
    const reusable = !isReset && existing && existing.sourceOrgId === sourceOrgId ? existing : null;
    if (!reusable) {
      await deleteSandboxForUser({ serviceClient, actor: auth.user });
    }

    const sandbox =
      reusable ??
      (await createSandboxForUser({
        serviceClient,
        actor: auth.user,
        sessionId: auth.sessionId,
        sourceOrgId,
      }));

    const response = NextResponse.json({
      success: true,
      sandbox: { id: sandbox.id, slug: sandbox.slug, reused: Boolean(reusable) },
    });
    response.cookies.set(
      SANDBOX_COOKIE_NAME,
      encodeSandboxCookieValue({
        sandboxOrgId: sandbox.id,
        userId: auth.user.id,
        sessionId: auth.sessionId,
      }),
      {
        path: "/",
        // Server-only: the cookie is set, read (middleware + api-auth), and
        // cleared (action: "exit") entirely server-side. No client JS reads it,
        // so HttpOnly closes the JS-readability gap with no functional cost.
        httpOnly: true,
        sameSite: "lax",
        // Secure over https only, as the auth cookies (authCookieOptions):
        // WebKit refuses a Secure cookie set over plain http, even on
        // localhost, so the sandbox never opened there.
        secure: req.nextUrl.protocol === "https:",
        maxAge: SANDBOX_COOKIE_MAX_AGE_SECONDS,
      },
    );
    return response;
  } catch (error) {
    Sentry.captureException(error, { extra: { context: "test-sandbox" } });
    logger.error({ error }, "Failed to toggle sandbox mode");
    return NextResponse.json(
      { error: formatClientErrorMessage(error, DEFAULT_ERROR_FALLBACK) },
      { status: 500 },
    );
  }
}
