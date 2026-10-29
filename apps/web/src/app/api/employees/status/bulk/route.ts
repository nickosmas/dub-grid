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
  statusChangeNeedsFreshProof,
  type BulkStatusResult,
  type StatusChangeAction,
} from "@/features/employees/server/status-change";
import { fetchOrgToday } from "@/features/employees/server/org-today";
import {
  BULK_STATUS_ACTIONS,
  BULK_STATUS_MAX_PEOPLE,
  isValidReturnDate,
  RETURN_DATE_INVALID_CODE,
  RETURN_DATE_INVALID_MESSAGE,
  type BulkStatusAction,
} from "@dubgrid/domain";
import { API_ERRORS } from "@dubgrid/client-errors";

export const dynamic = "force-dynamic";

const ROUTE_ACTIONS: Readonly<Record<BulkStatusAction, StatusChangeAction>> = {
  markActive: "activate",
  restore: "activate",
  reinstate: "reinstate",
  markAway: "deactivate",
  suspend: "suspend",
  archive: "remove",
};

const bodySchema = z
  .object({
    orgId: z.string().uuid(),
    action: z.enum(BULK_STATUS_ACTIONS as [BulkStatusAction, ...BulkStatusAction[]]),
    people: z
      .array(z.object({ empId: z.string().uuid(), expectedVersion: z.number().int().min(0) }))
      .min(1)
      .max(BULK_STATUS_MAX_PEOPLE)
      .refine((people) => new Set(people.map((p) => p.empId)).size === people.length),
    /** Mark away and Offboard: the reason, the same for everyone. */
    note: z.string().max(500).optional(),
    /** Mark away: the first day back, the same for everyone. */
    returnDate: z.string().date().nullable().optional(),
  })
  .refine((body) => body.note === undefined || ["markAway", "archive"].includes(body.action))
  .refine((body) => !body.returnDate || body.action === "markAway");

/**
 * POST /api/employees/status/bulk
 * One status change for several people (51h). Each person goes through the
 * single route's checks and side effects, one after another, and commits on
 * its own: a refusal or error for one never undoes or stops the rest.
 */
export async function POST(req: NextRequest) {
  const csrfError = validateCsrfOrigin(req);
  if (csrfError) return csrfError;

  const auth = await requireAuthenticatedUser(req);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  // One request, one check: pacing each person against the limit is what
  // made a large selection fail part way (F-103).
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
  const { action: bulkAction, people, note } = parsed.data;
  const action = ROUTE_ACTIONS[bulkAction];
  const returnDate = parsed.data.returnDate ?? null;

  let orgId = parsed.data.orgId;
  try {
    orgId = await resolveEffectiveOrgId(req, user.id, parsed.data.orgId);
    const serviceClient = getServiceClient();
    const [canManage, { isGridmaster, isSuperAdmin }] = await Promise.all([
      canManageEmployees(serviceClient, user.id, orgId),
      loadStatusTier(serviceClient, user.id, orgId),
    ]);
    if (!canManage) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
    }
    if (isGridmaster && statusChangeNeedsFreshProof(action)) {
      const assurance = await requireSensitiveActionAuth(req);
      if ("response" in assurance) return assurance.response;
    }
    // A shared date is checked once, not refused once per person.
    if (returnDate && !isValidReturnDate(returnDate, await fetchOrgToday(serviceClient, orgId))) {
      return NextResponse.json(
        { error: RETURN_DATE_INVALID_MESSAGE, code: RETURN_DATE_INVALID_CODE },
        { status: 400 },
      );
    }

    const context = {
      serviceClient,
      orgId,
      actor: { id: user.id, email: user.email ?? null, isGridmaster, isSuperAdmin },
      request: requestInfo(req),
      bulkAction,
    };
    const results: BulkStatusResult[] = [];
    // One after another, so the only-Super-Admin guard sees the changes before it.
    for (const { empId, expectedVersion } of people) {
      try {
        const result = await applyStatusChange(context, {
          empId,
          action,
          expectedVersion,
          note,
          returnDate,
          startDate: null,
          lastDay: null,
        });
        const { employee, error, code } = result.body as Omit<BulkStatusResult, "empId" | "ok">;
        results.push(
          result.status === 200
            ? { empId, ok: true, employee }
            : { empId, ok: false, error, code, ...(employee ? { employee } : {}) },
        );
      } catch (err) {
        Sentry.captureException(err, {
          extra: { context: "employees/status/bulk", empId, orgId, action },
        });
        logger.error({ error: err, empId, orgId, action }, "Bulk employee status change failed");
        results.push({ empId, ok: false, error: API_ERRORS.UNEXPECTED });
      }
    }
    return NextResponse.json({ results });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "employees/status/bulk", orgId, action } });
    logger.error({ error: err, orgId, action }, "Bulk employee status change failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
