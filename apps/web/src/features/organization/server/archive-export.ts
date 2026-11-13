import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/db/shared";
import {
  fetchPublishedShiftRows,
  publishedCellText,
  resolvePublishedScheduleEntry,
  type PublishedShiftRow,
} from "@/lib/published-shifts";
import { buildZip } from "@/lib/zip";
import { buildCsv, exportStaff } from "./csv-exports";

type Row = Record<string, unknown>;

const REQUEST_TYPES: Record<string, string> = {
  pickup: "Pickup",
  swap: "Swap",
  call_off: "Call-off",
};

function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

async function pagedRows(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  return fetchAllRows<Row>(
    (from, to) =>
      build(from, to) as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
  );
}

/** Everyone the organization ever had on record, for naming people in every file. */
async function staffNames(client: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const rows = await pagedRows((from, to) =>
    client
      .from("employees")
      .select("id, first_name, last_name")
      .eq("org_id", orgId)
      .order("id")
      .range(from, to),
  );
  return new Map(
    rows.map((row) => [text(row.id), `${text(row.first_name)} ${text(row.last_name)}`.trim()]),
  );
}

/** One row per person per published day, so years of history stay readable. */
async function scheduleCsv(
  client: SupabaseClient,
  orgId: string,
  names: Map<string, string>,
): Promise<string> {
  const [shifts, { data: absenceTypes }] = await Promise.all([
    fetchPublishedShiftRows(client, { orgId }),
    client.from("absence_types").select("id, label").eq("org_id", orgId),
  ]);
  const absenceTypeById = new Map(
    ((absenceTypes ?? []) as Row[]).map((row) => [row.id as number, text(row.label)]),
  );
  const rows = (shifts as PublishedShiftRow[]).flatMap((row) => {
    const entry = resolvePublishedScheduleEntry(row, new Map(), absenceTypeById);
    if (!entry) return [];
    return [[entry.date, names.get(entry.empId) ?? "", publishedCellText(entry, absenceTypeById)]];
  });
  return buildCsv(["Date", "Person", "Schedule"], rows);
}

async function requestsCsv(
  client: SupabaseClient,
  orgId: string,
  names: Map<string, string>,
): Promise<string> {
  const rows = await pagedRows((from, to) =>
    client
      .from("shift_requests")
      .select(
        "created_at, type, status, requester_emp_id, requester_shift_date, target_emp_id, target_shift_date, admin_note, resolved_at",
      )
      .eq("org_id", orgId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return buildCsv(
    [
      "Created",
      "Type",
      "Status",
      "Requested by",
      "Their date",
      "Other person",
      "Other date",
      "Note",
      "Resolved",
    ],
    rows.map((row) => [
      text(row.created_at),
      REQUEST_TYPES[text(row.type)] ?? text(row.type),
      text(row.status),
      names.get(text(row.requester_emp_id)) ?? "",
      text(row.requester_shift_date),
      names.get(text(row.target_emp_id)) ?? "",
      text(row.target_shift_date),
      text(row.admin_note),
      text(row.resolved_at),
    ]),
  );
}

/** The organization's own activity; DubGrid support's platform records stay out. */
async function activityCsv(client: SupabaseClient, orgId: string): Promise<string> {
  const rows = await pagedRows((from, to) =>
    client
      .from("audit_log")
      .select("created_at, actor_email, action, resource_type, resource_id, details")
      .eq("org_id", orgId)
      .or("details->>initiated_by.is.null,details->>initiated_by.neq.gridmaster")
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  return buildCsv(
    ["Time", "By", "Action", "Subject", "Subject id", "Details"],
    rows.map((row) => [
      text(row.created_at),
      text(row.actor_email),
      text(row.action),
      text(row.resource_type),
      text(row.resource_id),
      row.details == null ? "" : JSON.stringify(row.details),
    ]),
  );
}

/** `<subdomain>-dubgrid-export-<date>.zip`. */
export function archiveFilename(slug: string | null | undefined, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `${slug ? `${slug}-` : ""}dubgrid-export-${day}.zip`;
}

export const ARCHIVE_FILES = ["staff.csv", "schedule.csv", "requests.csv", "activity-log.csv"];

/**
 * Everything a customer keeps when their organization is deleted (F-203): the
 * staff list as the import reads it, every published day, every shift request
 * and the activity log, as CSVs in one ZIP.
 */
export async function buildOrganizationArchive(
  client: SupabaseClient,
  orgId: string,
  hiddenUserIds: readonly string[],
): Promise<Uint8Array<ArrayBuffer>> {
  const names = await staffNames(client, orgId);
  const [staff, schedule, requests, activity] = await Promise.all([
    exportStaff(client, orgId, hiddenUserIds, { includeArchived: true }),
    scheduleCsv(client, orgId, names),
    requestsCsv(client, orgId, names),
    activityCsv(client, orgId),
  ]);
  return buildZip(
    [staff, schedule, requests, activity].map((content, index) => ({
      name: ARCHIVE_FILES[index]!,
      content,
    })),
  );
}
