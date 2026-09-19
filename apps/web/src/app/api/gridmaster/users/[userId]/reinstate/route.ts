import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { apiErrorResponse } from "@/lib/error-handling";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

/**
 * POST /api/gridmaster/users/[userId]/reinstate
 *
 * Lifts a platform termination. Memberships stay archived and employee rows
 * stay removed: access is granted again explicitly by a gridmaster, so the
 * audit trail says who let the person back in.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) return assurance.response;

    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "We couldn't find that account. Refresh the page and try again." },
        { status: 400 },
      );
    }

    const { userId } = parsed.data;
    // Service-role call: the RPC is not exposed to authenticated clients, so
    // the gridmaster verified above is named explicitly as the actor.
    const serviceClient = getServiceClient();
    const result = await serviceClient.rpc("reinstate_user_account", {
      p_actor_id: auth.user.id,
      p_target_user_id: userId,
    });
    if (result.error) {
      return apiErrorResponse(result.error, "We couldn't reinstate that account. Try again.", 400);
    }

    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "user.reinstated",
      resourceType: "user",
      resourceId: userId,
      details: { targetUserId: userId },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "gridmaster reinstate POST failed");
    return NextResponse.json(
      { error: "We couldn't reinstate that account. Try again." },
      { status: 500 },
    );
  }
}
