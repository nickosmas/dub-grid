import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLogAfterCommit } from "@/app/api/gridmaster/_lib/audit";
import { scheduleTwoFactorResetNotice } from "@/app/api/gridmaster/_lib/two-factor-reset-notice";
import { loadPersonTarget } from "@/features/gridmaster/server/person-target";
import { resetPersonTwoFactor } from "@/features/gridmaster/server/two-factor-reset";

const paramsSchema = z.object({ userId: z.string().uuid() });
const bodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

const NOT_FOUND = "We couldn't find that account. Refresh the page and try again.";

/**
 * A Gridmaster, and only a Gridmaster, resets someone's two-factor: the
 * factors go, every session ends, the person is emailed, and their next
 * sign-in enrolls again.
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
        { error: "Give a reason for the reset. It is recorded in the audit log." },
        { status: 400 },
      );
    }

    const serviceClient = getServiceClient();
    const target = await loadPersonTarget(serviceClient, params.data.userId);
    if (!target) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const { factorsRemoved } = await resetPersonTwoFactor(serviceClient, target.userId);
    if (target.email) scheduleTwoFactorResetNotice(target.email);
    await writeGridmasterAuditLogAfterCommit({
      serviceClient,
      actor: auth.user,
      action: "user.mfa_reset",
      resourceType: "user",
      resourceId: target.userId,
      details: { targetUserId: target.userId, reason: parsed.data.reason, factorsRemoved },
      request: req,
    });
    return NextResponse.json({ success: true, factorsRemoved });
  } catch (error) {
    logger.error({ error }, "gridmaster two-factor reset failed");
    return NextResponse.json(
      { error: "We couldn't reset their two-factor. Try again; each step is safe to repeat." },
      { status: 500 },
    );
  }
}
