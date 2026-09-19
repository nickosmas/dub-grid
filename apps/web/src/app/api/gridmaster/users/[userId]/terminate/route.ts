import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLog } from "@/app/api/gridmaster/_lib/audit";
import { revokeAllUserSessions } from "@/lib/auth/revocation";
import { apiErrorResponse } from "@/lib/error-handling";

const paramsSchema = z.object({
  userId: z.string().uuid(),
});

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

/**
 * POST /api/gridmaster/users/[userId]/terminate
 *
 * Terminates an account platform-wide: every membership is archived, every
 * employee row is marked removed, every session is cut, and the database
 * refuses any organization-side attempt to bring the person back until a
 * gridmaster reinstates them. Irreversible from inside an organization.
 */
export async function POST(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) return assurance.response;

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return NextResponse.json(
        { error: "We couldn't find that account. Refresh the page and try again." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }
    const parsedBody = bodySchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json({ error: "A reason is required." }, { status: 400 });
    }

    const { userId } = parsedParams.data;
    // Service-role call: the RPC is not exposed to authenticated clients, so
    // the gridmaster verified above is named explicitly as the actor.
    const serviceClient = getServiceClient();
    const result = await serviceClient.rpc("terminate_user_account", {
      p_actor_id: auth.user.id,
      p_target_user_id: userId,
      p_reason: parsedBody.data.reason,
    });
    if (result.error) {
      return apiErrorResponse(result.error, "We couldn't terminate that account. Try again.", 400);
    }

    // The RPC removes tracked sessions and blocks refresh; the revocation
    // watermark makes the tokens already in hand fail app APIs immediately.
    await revokeAllUserSessions(userId);

    await writeGridmasterAuditLog({
      serviceClient,
      actor: auth.user,
      action: "user.terminated",
      resourceType: "user",
      resourceId: userId,
      details: {
        targetUserId: userId,
        reason: parsedBody.data.reason,
        ...(result.data && typeof result.data === "object" ? result.data : {}),
      },
      request: req,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error({ error }, "gridmaster terminate POST failed");
    return NextResponse.json(
      { error: "We couldn't terminate that account. Try again." },
      { status: 500 },
    );
  }
}
