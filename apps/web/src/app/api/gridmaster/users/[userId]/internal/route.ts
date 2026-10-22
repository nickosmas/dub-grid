import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLogAfterCommit } from "@/app/api/gridmaster/_lib/audit";
import { loadPersonTarget } from "@/features/gridmaster/server/person-target";

const paramsSchema = z.object({ userId: z.string().uuid() });
const bodySchema = z.object({
  isInternal: z.boolean(),
  reason: z.string().trim().min(1).max(500),
});

const NOT_FOUND = "We couldn't find that account. Refresh the page and try again.";

/**
 * A Gridmaster marks an account internal (QA), which hides it from every
 * organization member who is not internal themselves, or makes it a client
 * account again (migration 081).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  try {
    const auth = await requireGridmasterSession(req);
    if ("response" in auth) return auth.response;

    const assurance = await requireSensitiveActionAuth(req);
    if ("response" in assurance) return assurance.response;

    const params = paramsSchema.safeParse(await context.params);
    if (!params.success) return NextResponse.json({ error: NOT_FOUND }, { status: 400 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: API_ERRORS.INVALID_BODY }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Give a reason for the change. It is recorded in the audit log." },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();
    const target = await loadPersonTarget(serviceClient, params.data.userId);
    if (!target) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const { error } = await serviceClient
      .from("profiles")
      .update({ is_internal: parsed.data.isInternal })
      .eq("id", target.userId);
    if (error) throw error;

    await writeGridmasterAuditLogAfterCommit({
      serviceClient,
      actor: auth.user,
      action: parsed.data.isInternal ? "user.marked_internal" : "user.marked_client",
      resourceType: "user",
      resourceId: target.userId,
      details: { targetUserId: target.userId, reason: parsed.data.reason },
      request: req,
    });

    return NextResponse.json({ success: true, isInternal: parsed.data.isInternal });
  } catch (error) {
    logger.error({ error }, "gridmaster internal account change failed");
    return NextResponse.json(
      { error: "We couldn't change that account. Try again." },
      { status: 500 },
    );
  }
}
