import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createRequestSupabaseClient,
  requireGridmasterSession,
  requireSensitiveActionAuth,
} from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { dispatchNotificationEvent } from "@/features/notifications/server/events";
import { revokeAllUserSessions } from "@/lib/auth/revocation";

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

    const serviceClient = getServiceClient();
    const result = await createRequestSupabaseClient(req).rpc("force_logout_user", {
      p_target_user_id: parsed.data.userId,
    });

    if (result.error) {
      throw result.error;
    }

    // The SQL function removes tracked database sessions and blocks refresh.
    // Mirror that cutoff into the Route Handler revocation store so the
    // already-issued access token also fails app APIs immediately.
    await revokeAllUserSessions(parsed.data.userId);

    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "user.force_logout",
      resourceType: "user",
      resourceId: parsed.data.userId,
      details: { targetUserId: parsed.data.userId },
      request: req,
    });

    // Resolve the target's default org so the notification is org-scoped
    // (its bell + inbox is filtered by current org context). Falls back to
    // null when the target has no membership — the alert still reaches them
    // as a platform-scoped row.
    const { data: targetProfile } = await serviceClient
      .from("profiles")
      .select("org_id")
      .eq("id", parsed.data.userId)
      .maybeSingle();

    void dispatchNotificationEvent(auth.user.id, {
      action: "security_session_revoked",
      orgId: (targetProfile?.org_id as string | null) ?? null,
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
