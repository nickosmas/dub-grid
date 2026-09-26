import { NextRequest, NextResponse } from "next/server";
import { fetchLiveImpersonationSessionsForGridmaster } from "@/features/account/server";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { scheduleImpersonationNotice } from "@/app/api/gridmaster/_lib/impersonation-notice";
import { createRequestSupabaseClient, requireAuthenticatedUserWithClaims } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireAuthenticatedUserWithClaims(req);
    if ("response" in auth) {
      return auth.response;
    }

    // This endpoint only ends gridmaster impersonation sessions. Logout calls
    // it for every user (fire-and-forget), so for non-gridmasters it's an
    // explicit no-op rather than running gridmaster-scoped cleanup as them.
    if (auth.claims.platform_role !== "gridmaster") {
      return NextResponse.json({ success: true });
    }

    // Sessions end the way the portal ends them, with the person told and the
    // end recorded (F-35); deleting them sent no notice and erased the history.
    // Nothing else ends a timed-out row, so one found here may be days old: it
    // ends as expired, without a late email.
    const live = await fetchLiveImpersonationSessionsForGridmaster(auth.user.id);
    let failed = 0;
    if (live.length > 0) {
      const requestClient = createRequestSupabaseClient(req);
      const serviceClient = getServiceClient();
      const now = Date.now();
      for (const session of live) {
        const reason = Date.parse(session.expires_at) <= now ? "expired" : "manual";
        const { error } = await requestClient.rpc("end_impersonation", {
          p_session_id: session.session_id,
          p_reason: reason,
        });
        if (error) {
          failed += 1;
          logger.error({ error, sessionId: session.session_id }, "ending impersonation failed");
          continue;
        }
        if (reason === "manual") {
          scheduleImpersonationNotice({
            kind: "end",
            targetUserId: session.target_user_id,
            targetOrgId: session.target_org_id,
          });
        }
        try {
          await writeGridmasterAuditLog({
            serviceClient,
            actor: auth.user,
            action: "impersonation.ended",
            resourceType: "impersonation_session",
            resourceId: session.session_id,
            orgId: session.target_org_id,
            details: { reason, trigger: "sign_out" },
            request: req,
          });
        } catch (error) {
          failed += 1;
          logger.error({ error, sessionId: session.session_id }, "impersonation end audit failed");
        }
      }
    }
    if (failed > 0) {
      return NextResponse.json(
        { error: "We couldn't end those viewing sessions. Try again." },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "account logout cleanup failed");
    return NextResponse.json(
      { error: "We couldn't end those viewing sessions. Try again." },
      { status: 500 },
    );
  }
}
