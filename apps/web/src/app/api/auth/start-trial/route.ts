import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireAuthenticatedSession,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";

const startTrialSchema = z.object({
  orgId: z.string().uuid(),
});

// Starts an org's 14-day trial on the first super_admin login. Called from the
// genuine login flow only. The start_trial_for_org RPC self-gates to a
// super_admin membership and is idempotent (no-op once the trial has started),
// so this never starts a trial for an org the caller doesn't run.
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedSession(req);
    if ("response" in auth) {
      return auth.response;
    }
    void auth;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = startTrialSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const supabase = createRequestSupabaseClient(req);
    const result = await supabase.rpc("start_trial_for_org", {
      p_org_id: parsed.data.orgId,
    });

    if (result.error) {
      return NextResponse.json(
        { error: "Failed to start trial." },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("auth start-trial POST failed", error);
    return NextResponse.json(
      { error: "Failed to start trial" },
      { status: 500 },
    );
  }
}
