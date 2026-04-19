import { rowToEmployee, rowToShiftRequest } from "@/lib/db/mappers";
import type { DbShiftRequest } from "@/lib/db/types";
import type { Organization, Employee } from "@/types";
import type {
  MobileAbsenceType,
  MobileFocusArea,
  MobileNotification,
  MobileScheduleEntry,
  MobileScheduleEntrySegment,
  MobileShiftRequest,
} from "@dubgrid/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";

type EmbeddedEmployee = {
  id: string;
  first_name: string;
  last_name: string;
  org_id: string;
  focus_area_ids?: number[];
};

type MobileShiftCodeDetails = {
  label: string;
  name: string;
  focusAreaId: number | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  color: string | null;
  borderColor: string | null;
  textColor: string | null;
};

type MobileAbsenceDetails = {
  label: string;
  name: string;
  color: string | null;
  borderColor: string | null;
  textColor: string | null;
};

type MobilePublishHistoryEntry = {
  startDate: string;
  endDate: string;
  publishedAt: string;
  publishedByName: string | null;
};

export function resolveMobileDateRange(input?: {
  startDate?: string;
  endDate?: string;
}): { startDate: string; endDate: string } {
  const today = new Date();
  const start = input?.startDate
    ? new Date(`${input.startDate}T00:00:00`)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = input?.endDate
    ? new Date(`${input.endDate}T00:00:00`)
    : new Date(start.getTime() + 13 * 86_400_000);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function fetchLinkedEmployeeForUser(
  serviceClient: SupabaseClient,
  orgId: string,
  userId: string,
): Promise<Employee | null> {
  const { data, error } = await serviceClient
    .from("employees")
    .select(
      "id, org_id, first_name, last_name, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version",
    )
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return rowToEmployee(data);
}

async function fetchShiftCodeDetailsMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, MobileShiftCodeDetails>> {
  const { data } = await serviceClient
    .from("shift_codes")
    .select(
      "id, label, name, color, border_color, text_color, default_start_time, default_end_time, focus_area_id",
    )
    .eq("org_id", orgId)
    .is("archived_at", null);

  return new Map(
    (data ?? []).map((row) => [
      row.id as number,
      {
        label: row.label as string,
        name: (row.name as string | null) ?? (row.label as string),
        focusAreaId: (row.focus_area_id as number | null) ?? null,
        color: (row.color as string | null) ?? null,
        borderColor: (row.border_color as string | null) ?? null,
        textColor: (row.text_color as string | null) ?? null,
        defaultStartTime: (row.default_start_time as string | null) ?? null,
        defaultEndTime: (row.default_end_time as string | null) ?? null,
      },
    ]),
  );
}

async function fetchShiftCodeLabelMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, string>> {
  const detailsMap = await fetchShiftCodeDetailsMap(serviceClient, orgId);

  return new Map(
    Array.from(detailsMap.entries(), ([id, details]) => [id, details.label]),
  );
}

async function fetchAbsenceLabelMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, MobileAbsenceDetails>> {
  const { data } = await serviceClient
    .from("absence_types")
    .select("id, label, name, color, border_color, text_color")
    .eq("org_id", orgId)
    .is("archived_at", null);

  return new Map(
    (data ?? []).map((row) => [
      row.id as number,
      {
        label: row.label as string,
        name: (row.name as string | null) ?? (row.label as string),
        color: (row.color as string | null) ?? null,
        borderColor: (row.border_color as string | null) ?? null,
        textColor: (row.text_color as string | null) ?? null,
      },
    ]),
  );
}

export async function fetchMobileAbsenceTypes(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileAbsenceType[]> {
  const { data, error } = await serviceClient
    .from("absence_types")
    .select("id, label")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("label", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as number,
    label: row.label as string,
  }));
}

export async function fetchMobileFocusAreas(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobileFocusArea[]> {
  const { data, error } = await serviceClient
    .from("focus_areas")
    .select("id, name")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as number,
    name: row.name as string,
  }));
}

async function fetchFocusAreaNameMap(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<Map<number, string>> {
  const focusAreas = await fetchMobileFocusAreas(serviceClient, orgId);
  return new Map(focusAreas.map((focusArea) => [focusArea.id, focusArea.name]));
}

async function fetchEmployeeFocusAreaIdsMap(
  serviceClient: SupabaseClient,
  orgId: string,
  employeeIds: string[],
): Promise<Map<string, number[]>> {
  if (employeeIds.length === 0) {
    return new Map();
  }

  const { data, error } = await serviceClient
    .from("employees")
    .select("id, focus_area_ids")
    .eq("org_id", orgId)
    .in("id", employeeIds);

  if (error) {
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      Array.isArray(row.focus_area_ids)
        ? row.focus_area_ids.filter((value): value is number => typeof value === "number")
        : [],
    ]),
  );
}

async function fetchMobilePublishHistory(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<MobilePublishHistoryEntry[]> {
  const { data, error } = await serviceClient.rpc("get_publish_history", {
    p_org_id: orgId,
    p_limit: 100,
    p_offset: 0,
  });

  if (error || !data) {
    return [];
  }

  return (data as Record<string, unknown>[]).map((row) => ({
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    publishedAt: row.published_at as string,
    publishedByName: (row.published_by_name as string | null) ?? null,
  }));
}

function normalizeEmbeddedEmployee(value: unknown): EmbeddedEmployee | null {
  if (Array.isArray(value)) {
    return normalizeEmbeddedEmployee(value[0] ?? null);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<EmbeddedEmployee>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.first_name !== "string" ||
    typeof candidate.last_name !== "string" ||
    typeof candidate.org_id !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    org_id: candidate.org_id,
    focus_area_ids: Array.isArray(candidate.focus_area_ids)
      ? candidate.focus_area_ids.filter((value): value is number => typeof value === "number")
      : [],
  };
}

function joinShiftCodeText(
  shiftCodeIds: number[],
  shiftCodeMap: Map<number, MobileShiftCodeDetails>,
  field: "label" | "name",
): string {
  return shiftCodeIds
    .map((id) => shiftCodeMap.get(id)?.[field] ?? "?")
    .join(" / ");
}

function splitPipeParts(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

function pickPipeTime(
  value: string | null | undefined,
  which: "first" | "last",
): string | null {
  const parts = splitPipeParts(value);
  if (parts.length === 0) {
    return null;
  }

  return which === "first"
    ? (parts[0] ?? null)
    : (parts[parts.length - 1] ?? null);
}

function getFallbackTime(
  shiftCodeIds: number[],
  shiftCodeMap: Map<number, MobileShiftCodeDetails>,
  part: "start" | "end",
): string | null {
  if (shiftCodeIds.length === 0) {
    return null;
  }

  const code =
    part === "start"
      ? shiftCodeMap.get(shiftCodeIds[0]!)
      : shiftCodeMap.get(shiftCodeIds[shiftCodeIds.length - 1]!);

  if (!code) {
    return null;
  }

  return part === "start" ? code.defaultStartTime : code.defaultEndTime;
}

function buildMobileScheduleEntrySegments(input: {
  absenceTypeId: number | null;
  customStartTime: string | null;
  customEndTime: string | null;
  focusAreaNameMap: Map<number, string>;
  rowFocusAreaId: number | null;
  shiftCodeIds: number[];
  shiftCodeMap: Map<number, MobileShiftCodeDetails>;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
}): MobileScheduleEntrySegment[] {
  if (input.absenceTypeId != null) {
    return [
      {
        shiftName: input.shiftName,
        startTime: null,
        endTime: null,
        displayFocusAreaName: null,
      },
    ];
  }

  const customStartTimes = splitPipeParts(input.customStartTime);
  const customEndTimes = splitPipeParts(input.customEndTime);
  const segments = input.shiftCodeIds.map((shiftCodeId, index) => {
    const shiftCode = input.shiftCodeMap.get(shiftCodeId) ?? null;
    const segmentFocusAreaId =
      input.rowFocusAreaId ?? shiftCode?.focusAreaId ?? null;

    return {
      shiftName: shiftCode?.name ?? shiftCode?.label ?? "?",
      startTime:
        customStartTimes[index] ?? shiftCode?.defaultStartTime ?? null,
      endTime: customEndTimes[index] ?? shiftCode?.defaultEndTime ?? null,
      displayFocusAreaName:
        segmentFocusAreaId != null
          ? (input.focusAreaNameMap.get(segmentFocusAreaId) ?? null)
          : null,
    };
  });

  if (segments.length > 0) {
    return segments;
  }

  return [
    {
      shiftName: input.shiftName,
      startTime: input.startTime,
      endTime: input.endTime,
      displayFocusAreaName: null,
    },
  ];
}

function findPublishHistoryEntryForDate(
  history: MobilePublishHistoryEntry[],
  date: string,
): MobilePublishHistoryEntry | null {
  return (
    history.find((entry) => entry.startDate <= date && entry.endDate >= date) ??
    null
  );
}

export async function fetchMobileScheduleEntries(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    startDate: string;
    endDate: string;
    employeeId?: string;
  },
): Promise<MobileScheduleEntry[]> {
  const [shiftCodeMap, absenceMap, focusAreaNameMap, publishHistory] =
    await Promise.all([
      fetchShiftCodeDetailsMap(serviceClient, input.orgId),
      fetchAbsenceLabelMap(serviceClient, input.orgId),
      fetchFocusAreaNameMap(serviceClient, input.orgId),
      fetchMobilePublishHistory(serviceClient, input.orgId),
    ]);

  let query = serviceClient
    .from("shifts")
    .select(
      `
        emp_id,
        date,
        focus_area_id,
        published_shift_code_ids,
        published_absence_type_id,
        published_custom_start_time,
        published_custom_end_time,
        employees!inner(id, first_name, last_name, org_id, focus_area_ids)
      `,
    )
    .eq("org_id", input.orgId)
    .gte("date", input.startDate)
    .lte("date", input.endDate)
    .order("date", { ascending: true });

  if (input.employeeId) {
    query = query.eq("emp_id", input.employeeId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const employeeFocusAreaIdsMap = await fetchEmployeeFocusAreaIdsMap(
    serviceClient,
    input.orgId,
    Array.from(
      new Set(
        (data ?? [])
          .map((row) => row.emp_id)
          .filter((value): value is string => typeof value === "string"),
      ),
    ),
  );

  const entries: MobileScheduleEntry[] = [];

  for (const row of data ?? []) {
    const shiftCodeIds =
      (row.published_shift_code_ids as number[] | null) ?? [];
    const absenceTypeId =
      (row.published_absence_type_id as number | null) ?? null;
    if (shiftCodeIds.length === 0 && absenceTypeId == null) {
      continue;
    }

    const employee = normalizeEmbeddedEmployee(row.employees);
    if (!employee) {
      continue;
    }

    const absence =
      absenceTypeId != null ? (absenceMap.get(absenceTypeId) ?? null) : null;
    const primaryShiftCode =
      shiftCodeIds.length > 0
        ? (shiftCodeMap.get(shiftCodeIds[0]!) ?? null)
        : null;
    const shiftCodeLabel =
      absenceTypeId != null
        ? (absence?.label ?? "?")
        : joinShiftCodeText(shiftCodeIds, shiftCodeMap, "label");
    const shiftName =
      absenceTypeId != null
        ? (absence?.name ?? absence?.label ?? "Off")
        : joinShiftCodeText(shiftCodeIds, shiftCodeMap, "name");
    const startTime =
      absenceTypeId != null
        ? null
        : (pickPipeTime(
            (row.published_custom_start_time as string | null) ?? null,
            "first",
          ) ?? getFallbackTime(shiftCodeIds, shiftCodeMap, "start"));
    const endTime =
      absenceTypeId != null
        ? null
        : (pickPipeTime(
            (row.published_custom_end_time as string | null) ?? null,
            "last",
          ) ?? getFallbackTime(shiftCodeIds, shiftCodeMap, "end"));

    const employeeFocusAreaIds =
      employeeFocusAreaIdsMap.get(employee.id) ?? employee.focus_area_ids ?? [];
    const rowFocusAreaId = (row.focus_area_id as number | null) ?? null;
    const explicitFocusAreaId = rowFocusAreaId ?? primaryShiftCode?.focusAreaId ?? null;
    const focusAreaId =
      explicitFocusAreaId ?? employeeFocusAreaIds[0] ?? null;
    const focusAreaName =
      focusAreaId != null
        ? (focusAreaNameMap.get(focusAreaId) ?? null)
        : null;
    const displayFocusAreaName =
      absenceTypeId != null || explicitFocusAreaId == null
        ? null
        : (focusAreaNameMap.get(explicitFocusAreaId) ?? null);
    const publishEntry = findPublishHistoryEntryForDate(
      publishHistory,
      row.date as string,
    );
    const segments = buildMobileScheduleEntrySegments({
      absenceTypeId,
      customStartTime:
        (row.published_custom_start_time as string | null) ?? null,
      customEndTime: (row.published_custom_end_time as string | null) ?? null,
      focusAreaNameMap,
      rowFocusAreaId,
      shiftCodeIds,
      shiftCodeMap,
      shiftName,
      startTime,
      endTime,
    });

    entries.push({
      employeeId: employee.id,
      employeeName: `${employee.first_name} ${employee.last_name}`.trim(),
      date: row.date as string,
      shiftCodeIds,
      shiftLabel: shiftCodeLabel || shiftName,
      shiftCodeLabel,
      shiftName,
      absenceTypeId,
      focusAreaId,
      focusAreaName,
      displayFocusAreaName,
      startTime,
      endTime,
      customStartTime:
        (row.published_custom_start_time as string | null) ?? null,
      customEndTime: (row.published_custom_end_time as string | null) ?? null,
      segments,
      shiftColor: absence?.color ?? primaryShiftCode?.color ?? null,
      shiftBorderColor:
        absence?.borderColor ??
        primaryShiftCode?.borderColor ??
        absence?.color ??
        primaryShiftCode?.color ??
        null,
      shiftTextColor: absence?.textColor ?? primaryShiftCode?.textColor ?? null,
      publishedAt: publishEntry?.publishedAt ?? null,
      publishedByName: publishEntry?.publishedByName ?? null,
    });
  }

  return entries;
}

export async function fetchMobileShiftRequests(
  serviceClient: SupabaseClient,
  input: {
    orgId: string;
    employeeId?: string;
  },
): Promise<MobileShiftRequest[]> {
  const shiftCodeMap = await fetchShiftCodeLabelMap(serviceClient, input.orgId);

  let query = serviceClient
    .from("shift_requests")
    .select(
      `*,
       requester:employees!shift_requests_requester_emp_id_fkey(first_name, last_name),
       target:employees!shift_requests_target_emp_id_fkey(first_name, last_name)`,
    )
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: false });

  if (input.employeeId) {
    query = query.or(
      `requester_emp_id.eq.${input.employeeId},target_emp_id.eq.${input.employeeId}`,
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => {
    const requester = row.requester as {
      first_name: string;
      last_name: string;
    } | null;
    const target = row.target as {
      first_name: string;
      last_name: string;
    } | null;
    const mapped: DbShiftRequest = {
      id: row.id as string,
      org_id: row.org_id as string,
      type: row.type as DbShiftRequest["type"],
      status: row.status as DbShiftRequest["status"],
      requester_emp_id: row.requester_emp_id as string,
      requester_shift_date: row.requester_shift_date as string,
      requester_shift_code_ids: row.requester_shift_code_ids as number[],
      requester_focus_area_id:
        (row.requester_focus_area_id as number | null) ?? null,
      requester_custom_start_time:
        (row.requester_custom_start_time as string | null) ?? null,
      requester_custom_end_time:
        (row.requester_custom_end_time as string | null) ?? null,
      target_emp_id: (row.target_emp_id as string | null) ?? null,
      target_shift_date: (row.target_shift_date as string | null) ?? null,
      target_shift_code_ids:
        (row.target_shift_code_ids as number[] | null) ?? null,
      target_focus_area_id: (row.target_focus_area_id as number | null) ?? null,
      target_custom_start_time:
        (row.target_custom_start_time as string | null) ?? null,
      target_custom_end_time:
        (row.target_custom_end_time as string | null) ?? null,
      absence_type_id: (row.absence_type_id as number | null) ?? null,
      parent_request_id: (row.parent_request_id as string | null) ?? null,
      admin_user_id: (row.admin_user_id as string | null) ?? null,
      admin_note: (row.admin_note as string | null) ?? null,
      expires_at: row.expires_at as string,
      resolved_at: (row.resolved_at as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      requester_first_name: requester?.first_name,
      requester_last_name: requester?.last_name,
      target_first_name: target?.first_name ?? null,
      target_last_name: target?.last_name ?? null,
    };

    return rowToShiftRequest(mapped, shiftCodeMap) as MobileShiftRequest;
  });
}

export async function fetchMobilePeople(
  serviceClient: SupabaseClient,
  orgId: string,
): Promise<ReturnType<typeof rowToEmployee>[]> {
  const { data, error } = await serviceClient
    .from("employees")
    .select(
      "id, org_id, first_name, last_name, status, status_changed_at, status_note, certification_id, role_ids, seniority, focus_area_ids, phone, email, contact_notes, archived_at, user_id, department_ids, dept_admin_ids, version",
    )
    .eq("org_id", orgId)
    .order("first_name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(rowToEmployee);
}

export async function fetchMobileNotifications(
  userClient: SupabaseClient,
  input: { limit: number; offset: number },
): Promise<{ unreadCount: number; notifications: MobileNotification[] }> {
  const [
    { data: notifications, error: notificationError },
    { data: unreadCount, error: unreadError },
  ] = await Promise.all([
    userClient.rpc("get_notifications", {
      p_limit: input.limit,
      p_offset: input.offset,
    }),
    userClient.rpc("get_unread_notification_count"),
  ]);

  if (notificationError) throw notificationError;
  if (unreadError) throw unreadError;

  return {
    unreadCount: (unreadCount as number) ?? 0,
    notifications: (notifications ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        type: row.type as MobileNotification["type"],
        channel: (row.channel as "in_app" | "email") ?? "in_app",
        category: (row.category as string | null) ?? null,
        title: row.title as string,
        message: row.message as string,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        readAt: (row.read_at as string | null) ?? null,
        createdAt: row.created_at as string,
      }),
    ),
  };
}

export function mapOrganizationToMobileConfig(org: Organization) {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    shiftDisplayMode: org.shiftDisplayMode,
    labels: {
      focusArea: org.focusAreaLabel,
      certification: org.certificationLabel,
      role: org.roleLabel,
      department: org.departmentLabel,
    },
    featureFlags: org.featureOverrides ?? {},
  };
}
