import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { z } from "zod";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import { requireAuthenticatedUser, requireSensitiveActionAuth } from "@/lib/api-auth";
import { endUserSessions, revokeAllUserSessions } from "@/lib/auth/revocation";
import { disableMobilePushTokensForOrg } from "@dubgrid/data-access";
import { resolveEffectiveOrgId } from "@/app/api/shared/permissions";
import { canManageEmployees } from "@/app/api/employees/shared";
import logger from "@/lib/logger";
import { scheduleSuspensionNotice } from "@/features/employees/server/suspension-notice";
import * as Sentry from "@/lib/sentry";
import { rowToEmployee } from "@/lib/db/mappers";
import type { DbEmployee } from "@/lib/db/types";
import { EMPLOYEE_COLS, cacheDel, CacheKey } from "@/lib/db/shared";
import {
  AWAY_ABSENCE_INVALID_CODE,
  AWAY_ABSENCE_NEEDS_DATE_MESSAGE,
  AWAY_ABSENCE_UNKNOWN_MESSAGE,
  canMarkInactive,
  isAwayAbsenceRefusal,
  isValidReturnDate,
  NOT_AWAY_CODE,
  NOT_AWAY_MESSAGE,
  NOT_ON_SCHEDULE_CODE,
  NOT_ON_SCHEDULE_MESSAGE,
  NOT_SUSPENDABLE_CODE,
  NOT_SUSPENDABLE_MESSAGE,
  NOT_SUSPENDED_CODE,
  NOT_SUSPENDED_MESSAGE,
  RETURN_DATE_INVALID_CODE,
  RETURN_DATE_INVALID_MESSAGE,
  SELF_ACTION_FORBIDDEN_CODE,
  SELF_ACTION_FORBIDDEN_MESSAGE,
} from "@dubgrid/domain";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import { API_ERRORS } from "@dubgrid/client-errors";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  empId: z.string().uuid(),
  orgId: z.string().uuid(),
  action: z.enum(["deactivate", "activate", "remove", "setReturnDate", "suspend", "reinstate"]),
  expectedVersion: z.number().int().min(0),
  note: z.string().optional(),
  /** Mark away: an optional first day back. setReturnDate: the new one, or null to clear it. */
  returnDate: z.string().date().nullable().optional(),
  /**
   * Mark away and setReturnDate: the absence their away days hold (51f), or
   * null for none. Left out of setReturnDate, the current one stays.
   */
  absenceTypeId: z.number().int().positive().nullable().optional(),
});

async function fetchOrgToday(serviceClient: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await serviceClient
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .single();
  if (error) throw error;
  return getIsoDateInTimeZone(new Date(), (data as { timezone: string | null }).timezone);
}

function buildConflictResponse(employee: ReturnType<typeof rowToEmployee>) {
  return NextResponse.json(
    {
      error: "Employee status changed elsewhere. Review the latest values before saving again.",
      code: "EMPLOYEE_STATUS_CONFLICT",
      employee,
    },
    { status: 409 },
  );
}

function getRequestIp(req: NextRequest): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (!forwarded) return null;
  return forwarded.split(",")[0]?.trim() || null;
}

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
      { error: "Too many requests" },
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
    const [hasPermission, { data: membership }, { data: profile }] = await Promise.all([
      canManageEmployees(serviceClient, user.id, orgId),
      serviceClient
        .from("organization_memberships")
        .select("org_role, admin_permissions")
        .eq("user_id", user.id)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle(),
      serviceClient.from("profiles").select("platform_role").eq("id", user.id).single(),
    ]);

    const isGridmaster = profile?.platform_role === "gridmaster";
    const isSuperAdmin = membership?.org_role === "super_admin";

    if (!hasPermission) {
      return NextResponse.json({ error: API_ERRORS.CANNOT_MANAGE_EMPLOYEES }, { status: 403 });
    }

    // Taking a staff record out of the organization is an access removal, so a
    // Gridmaster needs fresh proof for it; reactivating does not (F-96).
    if (isGridmaster && (action === "deactivate" || action === "remove" || action === "suspend")) {
      const assurance = await requireSensitiveActionAuth(req);
      if ("response" in assurance) return assurance.response;
    }

    const { data: currentRow, error: currentError } = await serviceClient
      .from("employees")
      .select(EMPLOYEE_COLS)
      .eq("id", empId)
      .eq("org_id", orgId)
      .single();

    if (currentError) throw currentError;

    const currentEmployee = rowToEmployee(currentRow as DbEmployee);

    // Self-action guard: you cannot change your own staffing status
    // (bench / terminate / activate). Another admin must act.
    if (currentEmployee.userId === user.id) {
      return NextResponse.json(
        { error: SELF_ACTION_FORBIDDEN_MESSAGE, code: SELF_ACTION_FORBIDDEN_CODE },
        { status: 403 },
      );
    }

    if (currentEmployee.version !== expectedVersion) {
      return buildConflictResponse(currentEmployee);
    }

    if (action === "deactivate" && !canMarkInactive(currentEmployee.focusAreaIds)) {
      return NextResponse.json(
        { error: NOT_ON_SCHEDULE_MESSAGE, code: NOT_ON_SCHEDULE_CODE },
        { status: 400 },
      );
    }

    if (
      action === "suspend" &&
      (currentEmployee.status !== "active" ||
        currentEmployee.archivedAt ||
        currentEmployee.suspendedAt)
    ) {
      return NextResponse.json(
        { error: NOT_SUSPENDABLE_MESSAGE, code: NOT_SUSPENDABLE_CODE },
        { status: 400 },
      );
    }

    if (action === "reinstate" && !currentEmployee.suspendedAt) {
      return NextResponse.json(
        { error: NOT_SUSPENDED_MESSAGE, code: NOT_SUSPENDED_CODE },
        { status: 400 },
      );
    }

    if (
      action === "setReturnDate" &&
      (currentEmployee.status !== "inactive" || currentEmployee.archivedAt)
    ) {
      return NextResponse.json({ error: NOT_AWAY_MESSAGE, code: NOT_AWAY_CODE }, { status: 400 });
    }

    if (
      returnDate !== null &&
      (action === "deactivate" || action === "setReturnDate") &&
      !isValidReturnDate(returnDate, await fetchOrgToday(serviceClient, orgId))
    ) {
      return NextResponse.json(
        { error: RETURN_DATE_INVALID_MESSAGE, code: RETURN_DATE_INVALID_CODE },
        { status: 400 },
      );
    }

    if (
      absenceTypeId != null &&
      (action === "deactivate" || action === "setReturnDate") &&
      returnDate === null
    ) {
      return NextResponse.json(
        { error: AWAY_ABSENCE_NEEDS_DATE_MESSAGE, code: AWAY_ABSENCE_INVALID_CODE },
        { status: 400 },
      );
    }

    // Removing staff already fully blocks login at the JWT hook regardless of
    // org_role (see 002_functions_triggers.sql), so removing the org's only
    // super_admin here would lock the org out just as surely as deleting their
    // membership would — the same guard DELETE /api/organizations/access
    // applies before letting a super_admin be removed.
    if ((action === "remove" || action === "suspend") && currentEmployee.userId) {
      const { data: targetMembership } = await serviceClient
        .from("organization_memberships")
        .select("org_role")
        .eq("user_id", currentEmployee.userId)
        .eq("org_id", orgId)
        .is("archived_at", null)
        .maybeSingle();

      if (targetMembership?.org_role === "super_admin") {
        const { count } = await serviceClient
          .from("organization_memberships")
          .select("*", { count: "exact", head: true })
          .eq("org_id", orgId)
          .eq("org_role", "super_admin")
          .is("archived_at", null);

        if ((count ?? 0) <= 1) {
          return NextResponse.json(
            {
              error:
                action === "suspend"
                  ? "Cannot suspend the only super admin. Transfer ownership first."
                  : "Cannot remove the only super admin. Transfer ownership first.",
            },
            { status: 400 },
          );
        }
      }
    }

    const now = new Date().toISOString();
    // The service client has no auth.uid(), so name the actor: leaving turns
    // their future shifts into pending removals credited to this person.
    const update: Record<string, unknown> = {
      updated_by: user.id,
      version: expectedVersion + 1,
    };
    if (action !== "setReturnDate") update.status_changed_at = now;

    let auditAction = "employee.updated";
    let auditDetails: Record<string, unknown> = {
      fromStatus: currentEmployee.status,
    };

    switch (action) {
      case "deactivate":
        update.status = "inactive";
        update.status_note = note ?? "";
        update.away_until = returnDate;
        update.away_absence_type_id = absenceTypeId ?? null;
        auditAction = "employee.deactivated";
        auditDetails = {
          ...auditDetails,
          toStatus: "inactive",
          note: note ?? "",
          ...(returnDate ? { awayUntil: returnDate } : {}),
          ...(absenceTypeId ? { awayAbsenceTypeId: absenceTypeId } : {}),
        };
        break;
      case "setReturnDate":
        update.away_until = returnDate;
        if (absenceTypeId !== undefined) update.away_absence_type_id = absenceTypeId;
        auditAction = "employee.return_date_changed";
        auditDetails = {
          fromAwayUntil: currentEmployee.awayUntil ?? null,
          toAwayUntil: returnDate,
          ...(absenceTypeId !== undefined &&
          absenceTypeId !== (currentEmployee.awayAbsenceTypeId ?? null)
            ? {
                fromAwayAbsenceTypeId: currentEmployee.awayAbsenceTypeId ?? null,
                toAwayAbsenceTypeId: absenceTypeId,
              }
            : {}),
        };
        break;
      case "activate":
        update.status = "active";
        update.status_note = "";
        update.away_until = null;
        update.archived_at = null;
        auditAction = "employee.activated";
        auditDetails = {
          ...auditDetails,
          toStatus: "active",
        };
        break;
      case "suspend":
        update.suspended_at = now;
        update.suspended_by = user.id;
        auditAction = "employee.suspended";
        auditDetails = {};
        break;
      case "reinstate":
        update.suspended_at = null;
        update.suspended_by = null;
        auditAction = "employee.reinstated";
        auditDetails = {};
        break;
      case "remove":
        update.status = "removed";
        update.status_note = note ?? "";
        update.archived_at = now;
        auditAction = "employee.removed";
        auditDetails = {
          ...auditDetails,
          toStatus: "removed",
          note: note ?? "",
        };
        break;
    }

    const { data: updatedRow, error: updateError } = await serviceClient
      .from("employees")
      .update(update)
      .eq("id", empId)
      .eq("org_id", orgId)
      .eq("version", expectedVersion)
      .select(EMPLOYEE_COLS)
      .maybeSingle();

    if (updateError) {
      if (isAwayAbsenceRefusal(updateError)) {
        return NextResponse.json(
          { error: AWAY_ABSENCE_UNKNOWN_MESSAGE, code: AWAY_ABSENCE_INVALID_CODE },
          { status: 400 },
        );
      }
      throw updateError;
    }

    if (!updatedRow) {
      const { data: latestRow, error: latestError } = await serviceClient
        .from("employees")
        .select(EMPLOYEE_COLS)
        .eq("id", empId)
        .eq("org_id", orgId)
        .single();

      if (latestError) throw latestError;
      return buildConflictResponse(rowToEmployee(latestRow as DbEmployee));
    }

    const updatedEmployee = rowToEmployee(updatedRow as DbEmployee);

    // Cut the person's live tokens, not just their next sign-in.
    //
    // The JWT hook refuses to mint for a terminated employee, so they can't
    // sign in or refresh again — but an access token they already hold stays
    // cryptographically valid until it expires, and API routes verify tokens
    // locally now. Org-scoped routes would still reject them on the
    // per-request membership check; this covers the routes that only
    // authenticate. Non-fatal: never fail the status change over it.
    // A suspension signs them out of every device and stops their push here;
    // the hook refuses their next sign-in and refresh (101).
    if (action === "suspend" && currentEmployee.userId) {
      try {
        await endUserSessions(currentEmployee.userId);
        await disableMobilePushTokensForOrg(serviceClient, {
          userId: currentEmployee.userId,
          orgId,
        });
      } catch (err) {
        logger.error(
          { error: err, orgId, empId, userId: currentEmployee.userId, action },
          "Failed to end sessions or push after suspending",
        );
      }
    }

    if (action === "suspend") {
      scheduleSuspensionNotice({ orgId, empId, actorId: user.id });
    }

    if (action === "remove" && currentEmployee.userId) {
      try {
        await revokeAllUserSessions(currentEmployee.userId);
      } catch (err) {
        logger.error(
          { error: err, orgId, empId, userId: currentEmployee.userId, action },
          "Failed to revoke sessions after employee status change",
        );
      }
    }

    // Remove/activate a linked user's org membership in lockstep with their
    // employees.status, in the same request that already committed the status
    // change — not as a second, separately-triggered client call — so the two
    // can't diverge (e.g. the status update fails but access is revoked
    // anyway, or status flips back to active while access stays revoked).
    // Gated to gridmaster/super_admin — the same tier required by
    // DELETE /api/organizations/access — so a plain admin with only
    // canManageEmployees can't use Remove/Activate as a side door to change
    // org access they aren't allowed to touch directly.
    if (
      (action === "remove" || action === "activate") &&
      currentEmployee.userId &&
      (isGridmaster || isSuperAdmin)
    ) {
      const { error: membershipError } =
        action === "remove"
          ? await serviceClient
              .from("organization_memberships")
              .update({ archived_at: now, archived_by: user.id })
              .eq("user_id", currentEmployee.userId)
              .eq("org_id", orgId)
              .is("archived_at", null)
          : await serviceClient
              .from("organization_memberships")
              .update({ archived_at: null, archived_by: null })
              .eq("user_id", currentEmployee.userId)
              .eq("org_id", orgId)
              .not("archived_at", "is", null);

      if (membershipError) {
        logger.error(
          { error: membershipError, orgId, empId, userId: currentEmployee.userId, action },
          "Failed to sync organization membership with employee status change",
        );
      } else {
        await cacheDel(
          CacheKey.orgUsers(orgId),
          CacheKey.orgDirectory(orgId),
          CacheKey.employees(orgId),
          CacheKey.allUsers(),
        );
      }
    }

    const { error: auditError } = await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email ?? null,
      action: auditAction,
      resource_type: "employee",
      resource_id: empId,
      details: {
        ...auditDetails,
        changedFields: [
          action === "setReturnDate"
            ? "away_until"
            : action === "suspend" || action === "reinstate"
              ? "suspended_at"
              : "status",
        ],
      },
      ip_address: getRequestIp(req),
      user_agent: req.headers.get("user-agent"),
    });

    if (auditError) {
      logger.error(
        { error: auditError, orgId, empId, action },
        "Employee status audit log write failed",
      );
    }

    return NextResponse.json({ success: true, employee: updatedEmployee });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "employees/status", empId, orgId, action } });
    logger.error({ error: err, empId, orgId, action }, "Employee status change failed");
    return NextResponse.json({ error: API_ERRORS.UNEXPECTED }, { status: 500 });
  }
}
