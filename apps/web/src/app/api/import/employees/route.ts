import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { API_ERRORS } from "@dubgrid/client-errors";
import { withoutHiddenStaff } from "@dubgrid/data-access";
import { resolveOrganizationLabel } from "@dubgrid/domain";
import { requireAuthenticatedSession } from "@/lib/api-auth";
import { fetchHiddenPeople, requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { retryAfterSeconds } from "@/lib/retry-after";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { insertEmployees, MAX_EMPLOYEE_BATCH } from "@/features/employees/server/insert-employees";
import type { NewEmployeeInput } from "@/features/employees/server/insert-employees";
import { fetchOrgToday } from "@/features/employees/server/org-today";
import {
  checkStaffImportRows,
  staffImportReason,
  STAFF_IMPORT_MAX_ROWS,
  type ResolvedStaffImportRow,
  type StaffImportLabels,
  type StaffImportReferences,
  type StaffImportRow,
} from "@/features/employees/staff-import";

export const dynamic = "force-dynamic";

const cell = z.string().max(2000).optional().default("");

const rowSchema = z.object({
  rowNumber: z.number().int().positive(),
  firstName: cell,
  lastName: cell,
  email: cell,
  phone: cell,
  focusAreaNames: cell,
  certificationName: cell,
  roleNames: cell,
  employment: cell,
  firstDay: cell,
  contactNotes: cell,
});

const bodySchema = z.object({
  orgId: z.guid(),
  rows: z.array(rowSchema).min(1).max(STAFF_IMPORT_MAX_ROWS),
});

export interface ImportedPerson {
  rowNumber: number;
  id: string;
  email: string;
}

export interface RefusedImportRow {
  rowNumber: number;
  name: string;
  reason: string;
}

const INSERT_FALLBACK = "We couldn't add this person. Try again.";

function getRequestIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function loadImportContext(
  serviceClient: SupabaseClient,
  orgId: string,
  hiddenUserIds: string[],
) {
  const [org, focusAreas, certifications, roles, employees, today] = await Promise.all([
    serviceClient
      .from("organizations")
      .select("focus_area_label, certification_label, role_label")
      .eq("id", orgId)
      .single(),
    serviceClient
      .from("focus_areas")
      .select("id, name")
      .eq("org_id", orgId)
      .is("archived_at", null),
    serviceClient
      .from("certifications")
      .select("id, name, abbr")
      .eq("org_id", orgId)
      .is("archived_at", null),
    serviceClient
      .from("organization_roles")
      .select("id, name")
      .eq("org_id", orgId)
      .is("archived_at", null),
    // Everyone in any status holds their name, email and phone, so all are checked.
    withoutHiddenStaff(
      serviceClient
        .from("employees")
        .select("id, first_name, last_name, email, phone")
        .eq("org_id", orgId),
      hiddenUserIds,
    ).limit(10000),
    fetchOrgToday(serviceClient, orgId),
  ]);
  const failed = [org, focusAreas, certifications, roles, employees].find((result) => result.error);
  if (failed?.error) throw failed.error;

  const labelRow = org.data as {
    focus_area_label: string | null;
    certification_label: string | null;
    role_label: string | null;
  };
  const labels: StaffImportLabels = {
    focusArea: resolveOrganizationLabel("focusArea", labelRow.focus_area_label),
    certification: resolveOrganizationLabel("certification", labelRow.certification_label),
    role: resolveOrganizationLabel("role", labelRow.role_label),
  };
  const references: StaffImportReferences = {
    focusAreas: (focusAreas.data ?? []) as { id: number; name: string }[],
    certifications: (certifications.data ?? []) as {
      id: number;
      name: string;
      abbr: string | null;
    }[],
    roles: (roles.data ?? []) as { id: number; name: string }[],
  };
  const existing = (
    (employees.data ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ?? "",
    phone: row.phone ?? "",
  }));
  return { ...references, labels, existing, today };
}

function toNewEmployee(row: ResolvedStaffImportRow): NewEmployeeInput {
  return {
    firstName: row.firstName,
    lastName: row.lastName,
    employmentType: row.employmentType,
    status: "active",
    statusChangedAt: null,
    statusNote: "",
    firstDay: row.firstDay,
    certificationId: row.certificationId,
    roleIds: row.roleIds,
    focusAreaIds: row.focusAreaIds,
    phone: row.phone,
    email: row.email,
    contactNotes: row.contactNotes,
    userId: null,
    departmentIds: [],
    deptAdminIds: [],
    version: 0,
  };
}

function personName(row: StaffImportRow): string {
  return `${row.firstName} ${row.lastName}`.trim();
}

export async function POST(req: NextRequest) {
  try {
    const csrfError = validateCsrfOrigin(req);
    if (csrfError) return csrfError;

    const auth = await requireAuthenticatedSession(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;

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

    // Checked after auth + rate-limiting (not before) so a disabled flag can't be
    // used to probe this route for free, unauthenticated and unrate-limited.
    if (!(await isFeatureEnabled("csv_import"))) {
      return NextResponse.json(
        { error: "Importing is unavailable right now. Try again in a moment." },
        { status: 503 },
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: API_ERRORS.INVALID_INPUT, details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const orgAuth = await requireOrgPermissions(
      req,
      parsed.data.orgId,
      (permissions) =>
        permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageEmployees,
      { allowDuringSetup: true, gridmasterNeedsImpersonation: true },
    );
    if ("response" in orgAuth) return orgAuth.response;
    // The effective organization: a caller inside a Test Sandbox imports into
    // the sandbox, never into the real organization their client named.
    const { serviceClient, orgId } = orgAuth;

    const context = await loadImportContext(serviceClient, orgId, await fetchHiddenPeople(orgAuth));
    const checks = checkStaffImportRows(parsed.data.rows, context);

    const refused: RefusedImportRow[] = [];
    const toAdd: { row: StaffImportRow; resolved: ResolvedStaffImportRow }[] = [];
    for (const check of checks) {
      if (check.status === "blocked") {
        refused.push({
          rowNumber: check.row.rowNumber,
          name: personName(check.row),
          reason: staffImportReason(check.issues),
        });
      } else {
        toAdd.push({ row: check.row, resolved: check.resolved });
      }
    }

    const added: ImportedPerson[] = [];
    for (let start = 0; start < toAdd.length; start += MAX_EMPLOYEE_BATCH) {
      const batch = toAdd.slice(start, start + MAX_EMPLOYEE_BATCH);
      const outcome = await insertEmployees({
        serviceClient,
        orgId,
        actor: orgAuth.actor,
        employees: batch.map(({ resolved }) => toNewEmployee(resolved)),
        ip: getRequestIp(req),
        userAgent: req.headers.get("user-agent"),
        auditDetails: { source: "import" },
        reportEveryFailure: true,
      });

      if ("response" in outcome) {
        // A reference or first day the checks passed was refused anyway, most
        // likely changed in Settings mid-import; nothing in this batch was written.
        const body = (await outcome.response.json().catch(() => null)) as { error?: string } | null;
        for (const { row } of batch) {
          refused.push({
            rowNumber: row.rowNumber,
            name: personName(row),
            reason: body?.error ?? INSERT_FALLBACK,
          });
        }
        continue;
      }

      const failedAt = new Map(outcome.failed.map((failure) => [failure.index, failure.error]));
      let next = 0;
      batch.forEach(({ row }, index) => {
        const error = failedAt.get(index);
        if (error) {
          refused.push({ rowNumber: row.rowNumber, name: personName(row), reason: error });
          return;
        }
        const employee = outcome.employees[next++];
        added.push({ rowNumber: row.rowNumber, id: employee.id, email: employee.email });
      });
    }

    refused.sort((a, b) => a.rowNumber - b.rowNumber);
    return NextResponse.json({ added, refused, total: parsed.data.rows.length });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "import-employees" } });
    logger.error({ error: err }, "Bulk import failed");
    return NextResponse.json(
      { error: "We couldn't import those people. Try again." },
      { status: 500 },
    );
  }
}
