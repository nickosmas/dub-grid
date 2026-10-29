import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser, requireSensitiveActionAuth } from "@/lib/api-auth";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { canManageEmployees } from "@/app/api/employees/shared";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import {
  applyStatusChange,
  loadStatusTier,
  requestInfo,
  STATUS_CHANGE_ACTIONS,
  statusChangeNeedsFreshProof,
} from "@/features/employees/server/status-change";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  empId: z.string().uuid(),
  orgId: z.string().uuid(),
  action: z.enum(STATUS_CHANGE_ACTIONS),
  expectedVersion: z.number().int().min(0),
  note: z.string().optional(),
  /**
   * Mark away: an optional first day back. setReturnDate: the new one, or null
   * to clear it. Suspend, setSuspendedUntil and a planned suspension's
   * setPlannedChange: the first day with access again (51g3), or null for none.
   */
  returnDate: z.string().date().nullable().optional(),
  /**
   * Mark away and setReturnDate: the absence their away days hold (51f), or
   * null for none. Left out of setReturnDate, the current one stays.
   */
  absenceTypeId: z.number().int().positive().nullable().optional(),
  /**
   * Mark away, Suspend, Restore (`activate` for someone Offboarded) and
   * setPlannedChange: the first day. A day after today plans the change
   * (51g1, 51g3, 51l) instead of starting it; today or left out starts it.
   */
  startDate: z.string().date().nullable().optional(),
  /**
   * Offboard, and setPlannedChange on a planned last day: their last day
   * (51g2). They're offboarded the day after it instead of now.
   */
  lastDay: z.string().date().nullable().optional(),
});

/**
 * POST /api/employees/status
 * Server-side employee status change with permission validation.
 */
export async function POST(req: NextRequest) {
  // ── CSRF: validate Origin header ──────────────────────────────────
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  // ── Auth check ────────────────────────────────────────────────────
  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // ── Rate limit by user ID ─────────────────────────────────────────
  const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
  if (misconfigured) {
    return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (limited) {
    return NextResponse.json(
      { error: API_ERRORS.RATE_LIMITED },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(reset)) } },
    );
  }

  // ── Input validation ──────────────────────────────────────────────
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

  const { empId, action, expectedVersion, note } = parsed.data;
  const returnDate = parsed.data.returnDate ?? null;
  const absenceTypeId = parsed.data.absenceTypeId;
  const startDate = parsed.data.startDate ?? null;
  const lastDay = parsed.data.lastDay ?? null;
  // Effective (sandbox-redirected) org; resolved inside the try, declared here
  // so the catch block can reference it for logging. (H-1)
  let orgId = parsed.data.orgId;

  try {
    // Resolve the effective org: if the caller is in sandbox mode, route the
    // check AND the mutation to their sandbox, never the raw request orgId
    // (otherwise a sandbox user could mutate the real org). See H-1.
    orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);

    // ── Permission check ──────────────────────────────────────────────
    const serviceClient = getServiceClient();
    const [canManage, { isGridmaster, isSuperAdmin }] = await Promise.all([
      canManageEmployees(serviceClient, user.id, orgId),
      loadStatusTier(serviceClient, user.id, orgId),
    ]);
    if (!canManage) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
    }

    // Taking a staff record out of the organization is an access removal, so a
    // Gridmaster needs fresh proof for it; reactivating does not (F-96).
    if (isGridmaster && statusChangeNeedsFreshProof(action)) {
      const assurance = await requireSensitiveActionAuth(req);
      if ("response" in assurance) return assurance.response;
    }

    const result = await applyStatusChange(
      {
        serviceClient,
        orgId,
        actor: { id: user.id, email: user.email ?? null, isGridmaster, isSuperAdmin },
        request: requestInfo(req),
      },
      { empId, action, expectedVersion, note, returnDate, absenceTypeId, startDate, lastDay },
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "employees/status", empId, orgId, action } });
    logger.error({ error: err, empId, orgId, action }, "Employee status change failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
