import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
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
          headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) },
        },
      );
    }

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("org_id, platform_role")
      .eq("id", auth.user.id)
      .maybeSingle();

    // Which org gets cloned. The claim comes first, because it is the only
    // value scoped to THIS session: profiles.org_id is a per-user global that
    // switch_org rewrites on every device, so sourcing from it cloned whichever
    // org the user last switched to ANYWHERE. A user sitting on org A's
    // subdomain could press Enter and get a full copy of org B's employees,
    // schedules and PII, served under org A's slug.
    //
    // profiles.org_id stays as the fallback for exactly one case: `reset`,
    // where a sandbox cookie already exists and the auth layer has rewritten
    // claims.org_id to the sandbox itself, so the claim can no longer name the
    // source. On `enter` there is no cookie yet and the claim is correct.
    const hasSandboxCookie = Boolean(req.cookies.get(SANDBOX_COOKIE_NAME)?.value);
    const sourceOrgId = hasSandboxCookie
      ? ((profile?.org_id as string | undefined) ?? getClaimOrgId(auth.claims))
      : (getClaimOrgId(auth.claims) ?? (profile?.org_id as string | undefined) ?? null);
    if (!sourceOrgId) {
      return NextResponse.json(
        { error: "Pick an organization before entering sandbox mode." },
        { status: 400 },
      );
    }

    const isReset = parsed.data.action === "reset";

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
    const existing = isReset ? null : await findActiveSandboxForUser(serviceClient, auth.user.id);

    // For "reset": wipe any existing sandbox first so the recreate step gives
    // the user a truly fresh clone.
    if (isReset) {
      await deleteSandboxForUser({ serviceClient, actor: auth.user });
    }

    const sandbox =
      existing ??
      (await createSandboxForUser({
        serviceClient,
        actor: auth.user,
        sourceOrgId,
      }));

    const response = NextResponse.json({
      success: true,
      sandbox: { id: sandbox.id, slug: sandbox.slug, reused: Boolean(existing) },
    });
    response.cookies.set(
      SANDBOX_COOKIE_NAME,
      encodeSandboxCookieValue({
        sandboxOrgId: sandbox.id,
        userId: auth.user.id,
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
