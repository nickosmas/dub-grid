import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
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

    // action === "enter" or "reset". The auth layer rewrites
    // claims.org_id to the sandbox when a sandbox cookie is present, so
    // we can't read the source org from there. Pull it from the auth
    // user's profile instead.
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

    // For "reset": wipe any existing sandbox first so the recreate step
    // gives the user a truly fresh clone. For "enter": reuse the existing
    // sandbox if there is one (typical case is the user re-clicking enter
    // from another tab and expecting their in-progress work back).
    if (parsed.data.action === "reset") {
      await deleteSandboxForUser({ serviceClient, actor: auth.user });
    }

    const existing =
      parsed.data.action === "reset"
        ? null
        : await findActiveSandboxForUser(serviceClient, auth.user.id);
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
        httpOnly: false,
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
