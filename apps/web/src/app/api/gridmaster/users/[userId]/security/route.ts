import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireGridmasterSession, requireSensitiveActionAuth } from "@/lib/api-auth";
import { validateCsrfOrigin } from "@/lib/csrf";
import { clearLoginLock, loginLimiterConfigured } from "@/lib/rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import logger from "@/lib/logger";
import { writeGridmasterAuditLogAfterCommit } from "@/app/api/gridmaster/_lib/audit";
import { loadPersonTarget } from "@/features/gridmaster/server/person-target";
import {
  disablePersonPushDevice,
  endPersonSession,
  forgetPersonDevice,
  revokePersonCalendarFeed,
} from "@/features/gridmaster/server/person-security";

const paramsSchema = z.object({ userId: z.string().uuid() });

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("endSession"), sessionId: z.string().uuid() }),
  z.object({ action: z.literal("forgetDevice"), deviceId: z.string().uuid() }),
  z.object({ action: z.literal("disablePushDevice"), deviceId: z.string().uuid() }),
  z.object({ action: z.literal("revokeCalendarFeed"), feedId: z.string().uuid() }),
  z.object({ action: z.literal("clearLoginLock") }),
]);

const NOT_FOUND = "We couldn't find that account. Refresh the page and try again.";
const GONE = "That has already changed. Refresh the page to see where things stand.";

const AUDIT_ACTIONS = {
  endSession: "user.session_ended",
  forgetDevice: "user.device_forgotten",
  disablePushDevice: "user.push_device_disabled",
  revokeCalendarFeed: "user.calendar_feed_revoked",
  clearLoginLock: "user.login_lock_cleared",
} as const;

/** One support action on someone's sessions, devices, feeds or sign-in lock. */
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
      return NextResponse.json({ error: API_ERRORS.INVALID_INPUT }, { status: 400 });
    }

    const serviceClient = getServiceClient();
    const target = await loadPersonTarget(serviceClient, params.data.userId);
    if (!target) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });

    const input = parsed.data;
    let details: Record<string, unknown> = { targetUserId: target.userId };
    let loginLock: Awaited<ReturnType<typeof clearLoginLock>> | undefined;
    let changed: boolean;
    switch (input.action) {
      case "endSession":
        changed = await endPersonSession(serviceClient, target.userId, input.sessionId);
        details = { ...details, sessionId: input.sessionId };
        break;
      case "forgetDevice":
        changed = await forgetPersonDevice(serviceClient, target.userId, input.deviceId);
        details = { ...details, deviceId: input.deviceId };
        break;
      case "disablePushDevice":
        changed = await disablePersonPushDevice(serviceClient, target.userId, input.deviceId);
        details = { ...details, deviceId: input.deviceId };
        break;
      case "revokeCalendarFeed":
        changed = await revokePersonCalendarFeed(serviceClient, target.userId, input.feedId);
        details = { ...details, feedId: input.feedId };
        break;
      case "clearLoginLock":
        if (!loginLimiterConfigured()) {
          return NextResponse.json(
            { error: "The sign-in limiter does not run here, so there is no lock to clear." },
            { status: 409 },
          );
        }
        loginLock = await clearLoginLock(target.email);
        changed = true;
        break;
    }
    if (!changed) return NextResponse.json({ error: GONE }, { status: 404 });

    await writeGridmasterAuditLogAfterCommit({
      serviceClient,
      actor: auth.user,
      action: AUDIT_ACTIONS[input.action],
      resourceType: "user",
      resourceId: target.userId,
      details,
      request: req,
    });
    return NextResponse.json(
      loginLock === undefined ? { success: true } : { success: true, loginLock },
    );
  } catch (error) {
    logger.error({ error }, "gridmaster person security POST failed");
    return NextResponse.json({ error: "We couldn't do that. Try again." }, { status: 500 });
  }
}
