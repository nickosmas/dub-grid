import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { validateCsrfOrigin } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const NO_WELCOME = { shouldShowWelcome: false, trialEndsAt: null } as const;

// One-time "your trial has started" welcome for the super_admin whose first
// sign-in started the org's trial. It is shown only while the trial clock has
// started (trial_ends_at set) and the welcome has not been dismissed
// (trial_welcome_seen_at null). Scoped to the caller's effective org from the
// verified JWT — no orgId is accepted from the client.
//
// Sandbox is intentionally excluded: in a sandbox the claims are widened to
// super_admin and point at the clone (whose trial fields are irrelevant), so a
// welcome there would be noise.

export async function GET(req: NextRequest) {
  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;

  const { claims } = auth;
  const orgId = typeof claims.org_id === "string" ? claims.org_id : null;
  const isSuperAdmin = claims.org_role === "super_admin";
  const inSandbox = claims.in_sandbox === true;

  if (!orgId || !isSuperAdmin || inSandbox) {
    return NextResponse.json(NO_WELCOME);
  }

  try {
    const service = getServiceClient();
    const { data, error } = await service
      .from("organizations")
      .select("trial_ends_at, trial_welcome_seen_at")
      .eq("id", orgId)
      .maybeSingle();

    if (error || !data) return NextResponse.json(NO_WELCOME);

    const shouldShowWelcome =
      data.trial_ends_at !== null && data.trial_welcome_seen_at === null;

    return NextResponse.json({
      shouldShowWelcome,
      trialEndsAt: data.trial_ends_at ?? null,
    });
  } catch {
    // Non-critical surface: degrade to "no welcome" rather than error out.
    return NextResponse.json(NO_WELCOME);
  }
}

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUserWithClaims(req);
  if ("response" in auth) return auth.response;

  const { claims } = auth;
  const orgId = typeof claims.org_id === "string" ? claims.org_id : null;
  const isSuperAdmin = claims.org_role === "super_admin";
  const inSandbox = claims.in_sandbox === true;

  if (!orgId || !isSuperAdmin) {
    return NextResponse.json(
      { error: "You don't have permission to do that." },
      { status: 403 },
    );
  }

  // No-op in sandbox: never stamp the clone's trial state.
  if (inSandbox) return NextResponse.json({ success: true });

  try {
    const service = getServiceClient();
    // Idempotent: only stamp the first dismissal so the timestamp records when
    // the super_admin actually saw it.
    const { error } = await service
      .from("organizations")
      .update({ trial_welcome_seen_at: new Date().toISOString() })
      .eq("id", orgId)
      .is("trial_welcome_seen_at", null);

    if (error) {
      return NextResponse.json(
        { error: "Failed to dismiss the welcome." },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("trial-welcome POST failed", error);
    return NextResponse.json(
      { error: "Failed to dismiss the welcome." },
      { status: 500 },
    );
  }
}
