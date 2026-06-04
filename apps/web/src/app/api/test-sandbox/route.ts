import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import {
  SANDBOX_COOKIE_NAME,
  encodeSandboxCookieValue,
} from "@/lib/sandbox-cookie";
import {
  createSandboxForUser,
  deleteSandboxForUser,
  findActiveSandboxForUser,
} from "@/features/test-sandbox/server";

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
  return typeof claims.org_id === "string" && claims.org_id.length > 0
    ? claims.org_id
    : null;
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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
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
    const { limited, reset, misconfigured } = await checkRateLimit(
      apiLimiter,
      auth.user.id,
    );
    if (misconfigured) {
      return NextResponse.json(
        { error: "Service temporarily unavailable" },
        { status: 503 },
      );
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

    // The auth layer rewrites claims.org_id to the sandbox when a sandbox
    // cookie is present, so we can't read the source org from there. Pull it
    // from the auth user's profile instead.
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("org_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    const sourceOrgId =
      (profile?.org_id as string | undefined) ?? getClaimOrgId(auth.claims);
    if (!sourceOrgId) {
      return NextResponse.json(
        { error: "Pick an organization before entering sandbox mode." },
        { status: 400 },
      );
    }

    const isReset = parsed.data.action === "reset";

    // For "enter": reuse the existing sandbox if there is one (typical case is
    // the user re-clicking enter from another tab and expecting their
    // in-progress work back). For "reset": ignore it — we recreate below.
    const existing = isReset
      ? null
      : await findActiveSandboxForUser(serviceClient, auth.user.id);

    // Defense in depth: when we're about to CLONE (reset, or enter with no
    // existing sandbox), clone only an org the user is an active member of.
    // profile.org_id is system-set, but if a membership was archived without
    // clearing the default it could otherwise point at an org the user no
    // longer belongs to. Reusing an existing sandbox skips this — its source
    // was already validated at creation.
    if (!existing) {
      const { data: membership } = await serviceClient
        .from("organization_memberships")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("org_id", sourceOrgId)
        .is("archived_at", null)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json(
          { error: "You don't have access to that organization." },
          { status: 403 },
        );
      }
    }

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
    const message =
      error instanceof Error
        ? error.message
        : "We couldn't toggle sandbox mode right now.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
