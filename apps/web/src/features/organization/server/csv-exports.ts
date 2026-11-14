import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { withoutHiddenStaff } from "@dubgrid/data-access";
import {
  describeEmploymentStatus,
  orderFocusAreasByDepartment,
  resolveOrganizationLabel,
  upcomingFirstDay,
} from "@dubgrid/domain";
import { getIsoDateInTimeZone } from "@dubgrid/schedule-core";
import {
  EMPLOYMENT_CSV_LABELS,
  staffCsvHeaders,
  toStaffCsv,
} from "@/features/employees/staff-import";

function escapeCsvField(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\n");
}

/** The staff list as the import reads it; archived people too when asked. */
export async function exportStaff(
  supabase: SupabaseClient,
  orgId: string,
  hiddenUserIds: readonly string[],
  { includeArchived = false }: { includeArchived?: boolean } = {},
) {
  const staff = supabase
    .from("employees")
    .select(
      "id, first_name, last_name, email, phone, status, away_until, suspended_at, suspended_until, employment_type, first_day, seniority, focus_area_ids, certification_id, role_ids, contact_notes",
    )
    .eq("org_id", orgId);
  const { data: employees, error } = await withoutHiddenStaff(
    includeArchived ? staff : staff.is("archived_at", null),
    hiddenUserIds,
  )
    .order("seniority", { ascending: true })
    .limit(10000);

  if (error) throw error;

  // Fetch focus areas and certifications for name resolution
  const [
    { data: focusAreas },
    { data: departments },
    { data: certs },
    { data: roles },
    { data: org },
  ] = await Promise.all([
    supabase
      .from("focus_areas")
      .select("id, name, department_id, sort_order")
      .eq("org_id", orgId)
      .is("archived_at", null),
    supabase
      .from("departments")
      .select("id, type, sort_order")
      .eq("org_id", orgId)
      .is("archived_at", null),
    supabase.from("certifications").select("id, name").eq("org_id", orgId).is("archived_at", null),
    supabase
      .from("organization_roles")
      .select("id, name")
      .eq("org_id", orgId)
      .is("archived_at", null)
      .order("sort_order"),
    supabase
      .from("organizations")
      .select("focus_area_label, certification_label, role_label, timezone")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  const orderedFocusAreas = orderFocusAreasByDepartment(
    (
      (focusAreas ?? []) as {
        id: number;
        name: string;
        department_id: number | null;
        sort_order: number;
      }[]
    ).map((fa) => ({
      id: fa.id,
      name: fa.name,
      departmentId: fa.department_id,
      sortOrder: fa.sort_order,
    })),
    ((departments ?? []) as { id: number; type: string; sort_order: number }[]).map((d) => ({
      id: d.id,
      type: d.type,
      sortOrder: d.sort_order,
    })),
  );
  const faMap = new Map(orderedFocusAreas.map((fa) => [fa.id, fa.name]));
  // Names follow the order Settings lists them, not the order ids were saved in.
  const namesInOrder = (ids: number[], map: Map<number, string>) => [
    ...[...map].filter(([id]) => ids.includes(id)).map(([, name]) => name),
    ...ids.filter((id) => !map.has(id)).map(String),
  ];
  const certMap = new Map(
    (certs ?? []).map((c: Record<string, unknown>) => [c.id as number, c.name as string]),
  );
  const roleMap = new Map(
    (roles ?? []).map((r: Record<string, unknown>) => [r.id as number, r.name as string]),
  );

  const orgRow = (org ?? {}) as {
    focus_area_label?: string | null;
    certification_label?: string | null;
    role_label?: string | null;
    timezone?: string | null;
  };
  const labels = {
    focusArea: resolveOrganizationLabel("focusArea", orgRow.focus_area_label),
    certification: resolveOrganizationLabel("certification", orgRow.certification_label),
    role: resolveOrganizationLabel("role", orgRow.role_label),
  };
  const today = getIsoDateInTimeZone(new Date(), orgRow.timezone ?? null);

  // The import's columns first, so this file imports again; status and seniority after.
  const headers = [...staffCsvHeaders(labels), "Status", "Seniority"];
  const rows = ((employees ?? []) as Record<string, unknown>[]).map((emp) => [
    emp.first_name as string,
    emp.last_name as string,
    emp.email as string,
    emp.phone as string,
    namesInOrder((emp.focus_area_ids as number[]) ?? [], faMap).join("; "),
    emp.certification_id ? (certMap.get(emp.certification_id as number) ?? "") : "",
    namesInOrder((emp.role_ids as number[]) ?? [], roleMap).join("; "),
    EMPLOYMENT_CSV_LABELS[emp.employment_type === "part_time" ? "part_time" : "full_time"],
    upcomingFirstDay({ firstDay: (emp.first_day as string | null) ?? null }, today) ?? "",
    emp.contact_notes as string,
    describeEmploymentStatus(
      emp.status as string,
      emp.away_until as string | null,
      emp.suspended_at as string | null,
      emp.suspended_until as string | null,
    ),
    emp.seniority as number,
  ]);

  return toStaffCsv([headers, ...rows]);
}
