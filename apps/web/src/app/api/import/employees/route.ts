import { NextRequest, NextResponse } from "next/server";
import { API_ERRORS } from "@dubgrid/client-errors";
import { requireAuthenticatedSession } from "@/lib/api-auth";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { validateCsrfOrigin } from "@/lib/csrf";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";
import { getEmployeeContactConflict } from "@/lib/employee-contact-conflicts";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

const rowSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().email().or(z.literal("")).optional().default(""),
  phone: z.string().trim().optional().default(""),
  focusAreaNames: z.string().trim().optional().default(""),
  certificationName: z.string().trim().optional().default(""),
  roleNames: z.string().trim().optional().default(""),
  contactNotes: z.string().trim().optional().default(""),
});

// `rows` is validated as an array of unknown, unvalidated shapes here — each
// element is validated individually against `rowSchema` further down, so one
// malformed row (e.g. a bad email) surfaces as a per-row error instead of
// failing Zod's whole-array parse and rejecting the entire batch.
const bodySchema = z.object({
  orgId: z.string().uuid(),
  rows: z.array(z.unknown()).min(1).max(MAX_ROWS),
});

type ImportRow = z.infer<typeof rowSchema>;

export async function POST(req: NextRequest) {
  try {
    const csrfError = validateCsrfOrigin(req);
    if (csrfError) return csrfError;

    const auth = await requireAuthenticatedSession(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;

    // Rate limit by user ID
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
    if (misconfigured) {
      return NextResponse.json({ error: API_ERRORS.SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
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

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: API_ERRORS.INVALID_INPUT, details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { orgId: requestedOrgId, rows: rawRows } = parsed.data;

    // Validate each row individually — one malformed row (e.g. an invalid
    // email) shouldn't fail the whole batch. Its error joins the same
    // per-row `errors` array used below for name-resolution failures, and
    // the remaining valid rows still get imported.
    const errors: { row: number; error: string }[] = [];
    const parsedRows: { originalIndex: number; row: ImportRow }[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const rowResult = rowSchema.safeParse(rawRows[i]);
      if (!rowResult.success) {
        const firstIssue = rowResult.error.issues[0];
        errors.push({ row: i + 1, error: firstIssue?.message ?? "Invalid row data" });
        continue;
      }
      parsedRows.push({ originalIndex: i, row: rowResult.data });
    }

    const orgAuth = await requireOrgPermissions(
      req,
      requestedOrgId,
      (permissions) =>
        permissions.isGridmaster || permissions.isSuperAdmin || permissions.canManageEmployees,
      { allowDuringSetup: true },
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    const serviceClient = orgAuth.serviceClient;
    // The effective organization: a caller inside a Test Sandbox imports into
    // the sandbox, never into the real organization their client named.
    const orgId = orgAuth.orgId;

    // Fetch org's focus areas, certifications, and roles for name matching,
    // plus the current max seniority so imported rows can be appended to the
    // end of the seniority order (in CSV row order) — seniority isn't part
    // of the CSV and can be adjusted afterward via the People table reorder.
    const [{ data: focusAreas }, { data: certs }, { data: orgRoles }, { data: maxSeniorityRow }] =
      await Promise.all([
        serviceClient
          .from("focus_areas")
          .select("id, name")
          .eq("org_id", orgId)
          .is("archived_at", null),
        serviceClient
          .from("certifications")
          .select("id, name")
          .eq("org_id", orgId)
          .is("archived_at", null),
        serviceClient
          .from("organization_roles")
          .select("id, name")
          .eq("org_id", orgId)
          .is("archived_at", null),
        serviceClient
          .from("employees")
          .select("seniority")
          .eq("org_id", orgId)
          .order("seniority", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const baseSeniority = (maxSeniorityRow as { seniority: number } | null)?.seniority ?? 0;

    const faNameMap = new Map(
      (focusAreas ?? []).map((fa: Record<string, unknown>) => [
        (fa.name as string).toLowerCase(),
        fa.id as number,
      ]),
    );
    const certNameMap = new Map(
      (certs ?? []).map((c: Record<string, unknown>) => [
        (c.name as string).toLowerCase(),
        c.id as number,
      ]),
    );
    const roleNameMap = new Map(
      (orgRoles ?? []).map((r: Record<string, unknown>) => [
        (r.name as string).toLowerCase(),
        r.id as number,
      ]),
    );

    // Resolve names to IDs and build insert records
    const insertRecords: { index: number; record: Record<string, unknown> }[] = [];

    for (const { originalIndex, row } of parsedRows) {
      const errorCountBeforeRow = errors.length;

      // Resolve focus area names to IDs
      const faIds: number[] = [];
      if (row.focusAreaNames) {
        for (const name of row.focusAreaNames
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)) {
          const id = faNameMap.get(name.toLowerCase());
          if (id) faIds.push(id);
          else errors.push({ row: originalIndex + 1, error: `Unknown focus area: "${name}"` });
        }
      }

      // Resolve certification name
      let certId: number | null = null;
      if (row.certificationName) {
        certId = certNameMap.get(row.certificationName.toLowerCase()) ?? null;
        if (!certId) {
          errors.push({
            row: originalIndex + 1,
            error: `Unknown certification: "${row.certificationName}"`,
          });
        }
      }

      // Resolve role names
      const roleIds: number[] = [];
      if (row.roleNames) {
        for (const name of row.roleNames
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean)) {
          const id = roleNameMap.get(name.toLowerCase());
          if (id) roleIds.push(id);
          else errors.push({ row: originalIndex + 1, error: `Unknown role: "${name}"` });
        }
      }

      // An unresolved reference must reject this row instead of silently
      // creating an employee without the requested focus area, certification,
      // or role. The per-row error collected above is returned to the import
      // results screen while the rest of the file can still be imported.
      if (errors.length > errorCountBeforeRow) continue;

      insertRecords.push({
        index: originalIndex,
        record: {
          org_id: orgId,
          first_name: row.firstName,
          last_name: row.lastName,
          email: row.email || "",
          phone: row.phone || "",
          seniority: baseSeniority + originalIndex + 1,
          focus_area_ids: faIds,
          certification_id: certId,
          role_ids: roleIds,
          contact_notes: row.contactNotes || "",
        },
      });
    }

    // Batch insert in chunks of 50 instead of one-at-a-time
    const BATCH_SIZE = 50;
    const inserted: { row: number; name: string }[] = [];

    for (let batchStart = 0; batchStart < insertRecords.length; batchStart += BATCH_SIZE) {
      const batch = insertRecords.slice(batchStart, batchStart + BATCH_SIZE);
      const { error: batchError } = await serviceClient
        .from("employees")
        .insert(batch.map((b) => b.record));

      if (batchError) {
        // If batch fails, fall back to individual inserts for this batch
        for (const item of batch) {
          const { error: insertError } = await serviceClient.from("employees").insert(item.record);
          if (insertError) {
            // Surface the real reason — contact-uniqueness conflicts
            // (duplicate email/phone, or email belongs to a different
            // user account) come back via getEmployeeContactConflict so
            // the admin sees WHICH CSV rows were skipped and why.
            const contactConflict = getEmployeeContactConflict(insertError);
            const message =
              contactConflict?.message ?? "We couldn't import this employee. Try again.";
            logger.error({ error: insertError, row: item.index + 1 }, "Employee insert failed");
            errors.push({ row: item.index + 1, error: message });
          } else {
            inserted.push({
              row: item.index + 1,
              name: `${item.record.first_name} ${item.record.last_name}`,
            });
          }
        }
      } else {
        for (const item of batch) {
          inserted.push({
            row: item.index + 1,
            name: `${item.record.first_name} ${item.record.last_name}`,
          });
        }
      }
    }

    // Audit log — only when the import actually created someone.
    if (inserted.length > 0) {
      const { error: auditError } = await serviceClient.from("audit_log").insert({
        org_id: orgId,
        actor_id: user.id,
        actor_email: user.email,
        action: "employee.created",
        resource_type: "employee",
        resource_id: null,
        details: {
          bulkImport: true,
          total: rawRows.length,
          inserted: inserted.length,
          errors: errors.length,
        },
      });
      if (auditError) {
        logger.error({ error: auditError, orgId }, "Bulk import audit log write failed");
      }
    }

    return NextResponse.json({
      success: true,
      inserted: inserted.length,
      errors,
      total: rawRows.length,
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "import-employees" } });
    logger.error({ error: err }, "Bulk import failed");
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
