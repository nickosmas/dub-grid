import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
  requireSensitiveActionAuth,
  stepUpResponseForRefusal,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { scheduleSecurityAlert } from "@/features/account/server/security-alerts";
import { endUserSessions } from "@/lib/auth/revocation";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) {
    return csrfError;
  }

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) {
      return auth.response;
    }

    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) {
      return assurance.response;
    }

    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "We couldn't find that account. Refresh the page and try again." },
        { status: 400 },
      );
    }

    // Ending every session would sign the caller out of the one they are
    // using, and the SQL function deletes the rows a keep-one sign-out lists.
    // Their other devices have "Sign out other devices" for that.
    // UUIDs match case-insensitively in Postgres, so compare them that way.
    if (parsed.data.userId.toLowerCase() === auth.user.id.toLowerCase()) {
      return NextResponse.json(
        {
          error:
            "You can't force a sign-out on your own account. Use Sign out other devices in your security settings.",
        },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();
    const result = await createRequestSupabaseClient(req).rpc("force_logout_user", {
      p_target_user_id: parsed.data.userId,
    });

    if (result.error) {
      const stepUp = await stepUpResponseForRefusal(req, result.error);
      if (stepUp) return stepUp;
      throw result.error;
    }

    // The SQL function removes tracked database sessions and blocks refresh,
    // but only for five minutes: after that the refresh token mints a new
    // token on the same session. End the provider sessions too, which also
    // rejects the access tokens already issued (41b1).
    await endUserSessions(parsed.data.userId);

    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "user.force_logout",
      resourceType: "user",
      resourceId: parsed.data.userId,
      details: { targetUserId: parsed.data.userId },
      request: req,
    });

    // No organization: a Gridmaster ended every session on the sign-in, not a
    // session in one organization, so the alert is a platform row every inbox
    // shows and names no organization. Scheduled past the response, which a
    // bare promise was not.
    scheduleSecurityAlert(auth.user.id, {
      action: "security_session_revoked",
      orgId: null,
      targetUserId: parsed.data.userId,
      initiatedBy: "gridmaster",
      deviceLabel: null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "gridmaster force logout POST failed");
    return NextResponse.json(
      { error: "We couldn't sign that person out. Try again." },
      { status: 500 },
    );
  }
}
