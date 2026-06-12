import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateSelfMfaStatus } from "@/features/account/server";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { API_ERRORS } from "@dubgrid/client-errors";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { getServiceClient } from "@/lib/supabase-service";

const mfaStatusSchema = z.object({
  enabled: z.boolean(),
});

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) {
      return auth.response;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }

    const parsed = mfaStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    // Read the prior value so we only notify on an actual change. The MFA
    // editor in Settings may POST the current state on save without toggling.
    const { data: priorProfile } = await getServiceClient()
      .from("profiles")
      .select("mfa_enabled, org_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    const wasEnabled = priorProfile?.mfa_enabled === true;

    const profile = await updateSelfMfaStatus(auth.user.id, parsed.data.enabled);

    if (wasEnabled !== parsed.data.enabled) {
      void dispatchNotificationEvent(auth.user.id, {
        action: "security_mfa_changed",
        orgId: (priorProfile?.org_id as string | null) ?? null,
        targetUserId: auth.user.id,
        enabled: parsed.data.enabled,
      });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("account mfa status POST failed", error);
    return NextResponse.json(
      { error: "Failed to update MFA status" },
      { status: 500 },
    );
  }
}
