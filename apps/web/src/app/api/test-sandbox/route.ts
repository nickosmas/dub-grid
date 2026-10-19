import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { getServiceClient } from "@/lib/supabase-service";
import { SANDBOX_COOKIE_NAME, encodeSandboxCookieValue } from "@/lib/sandbox-cookie";
import {
  createSandboxForUser,
  deleteSandboxForUser,
  findActiveSandboxForUser,
} from "@/features/test-sandbox/server";
import { API_ERRORS, DEFAULT_ERROR_FALLBACK } from "@dubgrid/client-errors";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { formatClientErrorMessage } from "@/lib/client-facing";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enter") }),
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

  const auth = await requireAuthenticatedUserWithClaims(req);
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
        { error: "Too many requests" },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfterSeconds(reset)) },
        },
      );
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("org_id, platform_role")
      .eq("id", auth.user.id)
      .maybeSingle();

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

    // Sandbox mode is admin+ only (mirrors Header.tsx's client-side
    // canOpenSandbox gate) — enforce it server-side too. auth.claims.org_role
    // can't be used for this: requireAuthenticatedUserWithClaims already
    // widens it to "super_admin" once a sandbox cookie exists, which would
    // let a user demoted after entering keep resetting their sandbox. Look
    // the caller's real role in the source org up directly instead. This
    // also replaces the old membership-existence-only check, since verifying
    // org_role in ('admin','super_admin') already implies active membership.
    const isGridmaster = profile?.platform_role === "gridmaster";
    let sourceMembership: { org_role?: string } | null = null;
    if (!isGridmaster) {
      const { data } = await serviceClient
        .from("organization_memberships")
        .select("org_role")
        .eq("user_id", auth.user.id)
        .eq("org_id", sourceOrgId)
        .is("archived_at", null)
        .maybeSingle();
      sourceMembership = data;
      const role = sourceMembership?.org_role as string | undefined;
      if (role !== "admin" && role !== "super_admin") {
        return NextResponse.json(
          { error: "You don't have permission to use sandbox mode." },
          { status: 403 },
        );
      }
    }

    // For "enter": reuse the existing sandbox if there is one (typical case is
    // the user re-clicking enter from another tab and expecting their
    // in-progress work back). For "reset": ignore it — we recreate below.
    // One sandbox is retained per user. A sandbox from another browser session
    // is invalid for this request and is removed before this session creates
    // its own, so stale state cannot silently migrate between sessions.
    if (isReset || !existing) {
      await deleteSandboxForUser({ serviceClient, actor: auth.user });
    }

    const reusable = isReset ? null : existing;
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
        secure: process.env.NODE_ENV === "production",
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
