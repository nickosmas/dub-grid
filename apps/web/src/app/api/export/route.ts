import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import {
  fetchPublishedShiftRows,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";
import { z } from "zod";
import { requireOrgPermissions } from "@/app/api/shared/permissions";
import { apiLimiter, checkRateLimit } from "@/lib/rate-limit";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import logger from "@/lib/logger";
import * as Sentry from "@/lib/sentry";

const querySchema = z.object({
  type: z.enum(["staff", "schedule"]),
  orgId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\n");
}

async function exportStaff(orgId: string) {
  const supabase = getServiceClient();

  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, phone, status, status_note, seniority, focus_area_ids, certification_id, role_ids, contact_notes, archived_at")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("seniority", { ascending: true })
    .limit(10000);

  if (error) throw error;

  // Fetch focus areas and certifications for name resolution
  const [{ data: focusAreas }, { data: certs }, { data: roles }] = await Promise.all([
    supabase.from("focus_areas").select("id, name").eq("org_id", orgId).is("archived_at", null),
    supabase.from("certifications").select("id, name").eq("org_id", orgId).is("archived_at", null),
    supabase.from("organization_roles").select("id, name").eq("org_id", orgId).is("archived_at", null),
  ]);

  const faMap = new Map((focusAreas ?? []).map((fa: Record<string, unknown>) => [fa.id as number, fa.name as string]));
  const certMap = new Map((certs ?? []).map((c: Record<string, unknown>) => [c.id as number, c.name as string]));
  const roleMap = new Map((roles ?? []).map((r: Record<string, unknown>) => [r.id as number, r.name as string]));

  const headers = ["First Name", "Last Name", "Email", "Phone", "Status", "Seniority", "Focus Areas", "Certification", "Roles", "Notes"];
  const rows = (employees ?? []).map((emp: Record<string, unknown>) => [
    emp.first_name as string,
    emp.last_name as string,
    emp.email as string,
    emp.phone as string,
    emp.status as string,
    emp.seniority as number,
    ((emp.focus_area_ids as number[]) ?? []).map((id) => faMap.get(id) ?? String(id)).join("; "),
    emp.certification_id ? (certMap.get(emp.certification_id as number) ?? "") : "",
    ((emp.role_ids as number[]) ?? []).map((id) => roleMap.get(id) ?? String(id)).join("; "),
    emp.contact_notes as string,
  ]);

  return buildCsv(headers, rows);
}

async function exportSchedule(orgId: string, startDate?: string, endDate?: string) {
  const supabase = getServiceClient();

  // Default to current week if no dates provided
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay()); // Sunday
  const start = startDate ?? weekStart.toISOString().split("T")[0];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const end = endDate ?? weekEnd.toISOString().split("T")[0];

  // Cap at 90 days to prevent unbounded queries
  const daySpan = (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24);
  if (daySpan > 90) {
    throw new Error("Schedule export date range cannot exceed 90 days");
  }

  // Fetch employees
  const { data: employees, error: empErr } = await supabase
    .from("employees")
    .select("id, first_name, last_name")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("seniority", { ascending: true });
  if (empErr) throw empErr;

  // Fetch shifts in date range
  const shifts = await fetchPublishedShiftRows(supabase, {
    orgId,
    startDate: start,
    endDate: end,
  });

  // Fetch absence types for published absence labels.
  const [{ data: absenceTypes }] = await Promise.all([
    supabase
      .from("absence_types")
      .select("id, label")
      .eq("org_id", orgId)
      .is("archived_at", null),
  ]);
  const absenceTypeById = new Map(
    (absenceTypes ?? []).map((row: Record<string, unknown>) => [
      row.id as number,
      row.label as string,
    ]),
  );

  // Build date columns
  const dates: string[] = [];
  const d = new Date(start + "T00:00:00");
  const endD = new Date(end + "T00:00:00");
  while (d <= endD) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }

  // Index shifts by emp_id:date
  const shiftIndex = new Map<string, string>();
  for (const row of shifts as PublishedShiftRow[]) {
    const entry = resolvePublishedScheduleEntry(
      row,
      new Map(),
      absenceTypeById,
    );
    if (!entry) continue;
    shiftIndex.set(`${entry.empId}:${entry.date}`, entry.label);
  }

  const headers = ["Employee", ...dates.map((d) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  })];

  const rows = (employees ?? []).map((emp: Record<string, unknown>) => {
    const name = `${emp.first_name} ${emp.last_name}`;
    return [name, ...dates.map((date) => shiftIndex.get(`${emp.id}:${date}`) ?? "")];
  });

  return buildCsv(headers, rows);
}

export async function GET(req: NextRequest) {
  try {
    // Auth check
    const auth = await requireAuthenticatedUser(req);
    if ("response" in auth) return auth.response;
    const { user } = auth;

    // Rate limit by user ID
    const { limited, reset, misconfigured } = await checkRateLimit(apiLimiter, user.id);
    if (misconfigured) {
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    if (limited) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil((reset ?? 0) / 1000)) } },
      );
    }

    // Parse params
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      type: searchParams.get("type"),
      orgId: searchParams.get("orgId"),
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const { type, orgId, startDate, endDate } = parsed.data;

    const orgAuth = await requireOrgPermissions(
      req,
      orgId,
      (permissions) =>
        permissions.isGridmaster ||
        permissions.isSuperAdmin ||
        (type === "staff" && permissions.canManageEmployees) ||
        (type === "schedule" && permissions.canEditShifts),
    );
    if ("response" in orgAuth) {
      return orgAuth.response;
    }
    const serviceClient = orgAuth.serviceClient;

    let csv: string;
    let filename: string;

    if (type === "staff") {
      csv = await exportStaff(orgId);
      filename = `staff-export-${new Date().toISOString().split("T")[0]}.csv`;
    } else {
      csv = await exportSchedule(orgId, startDate, endDate);
      filename = `schedule-export-${startDate ?? "current"}-${endDate ?? "week"}.csv`;
    }

    // Audit log the export
    await serviceClient.from("audit_log").insert({
      org_id: orgId,
      actor_id: user.id,
      actor_email: user.email,
      action: "data.exported",
      resource_type: "data_export",
      resource_id: type,
      details: { type, startDate, endDate },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { context: "export" } });
    logger.error({ error: err }, "Export failed");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
