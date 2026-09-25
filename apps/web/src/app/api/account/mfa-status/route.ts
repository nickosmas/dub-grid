import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveVerifiedTotpFactorPresence } from "@dubgrid/authz";
import { updateSelfMfaStatus } from "@/features/account/server";
import { createRequestSupabaseClient, requireAuthenticatedUser } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import { API_ERRORS } from "@dubgrid/client-errors";
import { scheduleSecurityAlert } from "@/features/account/server/security-alerts";
import { getServiceClient } from "@/lib/supabase-service";

const mfaStatusSchema = z.object({
  // Older clients send this field. Validate its shape but never trust its value.
  enabled: z.boolean().optional(),
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

    const { data, error } = await createRequestSupabaseClient(req).auth.getUser();
    if (error) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (!data.user || data.user.id !== auth.user.id) {
      return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    }
    const enabled = resolveVerifiedTotpFactorPresence(data.user.factors);
    if (enabled === null) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }

    // Read the prior value so we only notify on an actual change. The MFA
    // editor in Settings may POST the current state on save without toggling.
    const { data: priorProfile, error: priorError } = await getServiceClient()
      .from("profiles")
      .select("mfa_enabled, org_id")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (priorError) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    const wasEnabled = priorProfile?.mfa_enabled === true;

    const profile = await updateSelfMfaStatus(auth.user.id, enabled);

    if (wasEnabled !== enabled) {
      scheduleSecurityAlert(auth.user.id, {
        action: "security_mfa_changed",
        orgId: (priorProfile?.org_id as string | null) ?? null,
        targetUserId: auth.user.id,
        enabled,
      });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    logger.error({ error }, "account mfa status POST failed");
    return NextResponse.json(
      { error: "We couldn't update two-factor authentication. Try again." },
      { status: 500 },
    );
  }
}
