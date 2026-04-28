import type {
  Department,
  DepartmentType,
  Employee,
  FocusArea,
  AssignmentDefinition,
  AbsenceType,
  Invitation,
  CoverageRequirement,
  IndicatorType,
  JobDefinition,
  NamedItem,
  OrganizationUser,
  RecurringShift,
  ResolvedSchedulePresentation,
  ScheduleCellInput,
  SeriesFrequency,
  ShiftCategory,
  ShiftJobSegment,
  ShiftRequest,
} from "@/types";
import type {
  AdminPermissions,
  AssignableOrganizationRole,
  Organization,
  OrganizationRole,
  PlatformRole,
  ShiftDisplayMode,
} from "@dubgrid/domain";
import type {
  DbFocusArea,
  DbDepartment,
  DbShiftCategory,
  DbJobDefinition,
  DbCoverageRequirement,
  DbAssignmentDefinition,
  DbAbsenceType,
  DbIndicatorType,
  DbInvitation,
  DbRecurringShift,
  DbNamedItem,
} from "./types";
import type {
  DbEmployee,
  DbOrganization,
  DbOrganizationMembership,
  DbShiftRequest,
} from "@dubgrid/db-types";
import { trimTime, resolveCodeLabels, iterateDateRange, MAX_SERIES_OCCURRENCES } from "./shared";
import {
  deriveAssignmentDefinitionIdsFromAssignments,
  joinShiftJobSegmentLabels,
  resolveShiftJobSegments,
} from "@/lib/shift-job-segments";
import type { SegmentCompatibilityMaps } from "@/lib/shift-job-segments";
import { composeOrganizationAddress } from "@/lib/organization-profile";
import { normalizePresetBg } from "@/lib/colors";

const EMPTY_SCHEDULED_JOB_STYLE = {
  color: "",
  border: "",
  text: "",
} as const;

// ── Named Item (certifications / organization_roles) ─────────────────────────

export function rowToNamedItem(row: DbNamedItem): NamedItem {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
    isScheduleRole: row.is_schedule_role ?? true,
    departmentId: row.department_id ?? null,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToDepartment(row: DbDepartment): Department {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
    type: row.type as DepartmentType,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
    permissions: (row.permissions as unknown as AdminPermissions) ?? null,
  };
}

export function rowToOrganization(row: DbOrganization): Organization {
  const addressLine1 = row.address_line_1 || row.address || "";
  const addressLine2 = row.address_line_2 || "";
  const addressCity = row.address_city || "";
  const addressState = row.address_state || "";
  const addressPostalCode = row.address_postal_code || "";
  const addressCountry = row.address_country || "";

  return {
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    address: composeOrganizationAddress({
      addressLine1,
      addressLine2,
      addressCity,
      addressState,
      addressPostalCode,
      addressCountry,
    }) || row.address,
    addressLine1,
    addressLine2,
    addressCity,
    addressState,
    addressPostalCode,
    addressCountry,
    phone: row.phone,
    employeeCount: row.employee_count,
    focusAreaLabel: row.focus_area_label ?? 'Focus Areas',
    certificationLabel: row.certification_label ?? 'Certifications',
    roleLabel: row.role_label ?? 'Roles',
    departmentLabel: row.department_label ?? 'Scheduled Departments',
    shiftDisplayMode: (row.shift_display_mode as ShiftDisplayMode) ?? 'code',
    timezone: row.timezone ?? null,
    payPeriodStartDate: row.pay_period_start_date ?? null,
    archivedAt: row.archived_at ?? null,
    suspendedAt: row.suspended_at ?? null,
    suspendedReason: row.suspended_reason ?? null,
    enforceConflictPrevention: row.enforce_conflict_prevention ?? false,
    stripeCustomerId: row.stripe_customer_id ?? null,
    subscriptionStatus: row.subscription_status ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    subscriptionSeats: row.subscription_seats ?? null,
    dataRetentionDays: row.data_retention_days ?? 365,
    featureOverrides: row.feature_overrides ?? {},
    updatedAt: row.updated_at ?? null,
  };
}

export function rowToOrganizationUser(
  row: Record<string, unknown>,
): OrganizationUser {
  return {
    id: row.id as string,
    email: (row.email as string | null) ?? null,
    firstName: (row.first_name as string | null) ?? null,
    lastName: (row.last_name as string | null) ?? null,
    orgRole: (row.org_role as OrganizationRole) ?? "user",
    platformRole: (row.platform_role as PlatformRole) ?? "none",
    adminPermissions: (row.admin_permissions as AdminPermissions | null) ?? null,
    createdAt: row.created_at as string,
    lastSignInAt: (row.last_sign_in_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    departmentIds: (row.department_ids as number[]) ?? [],
    deptAdminIds: (row.dept_admin_ids as number[]) ?? [],
  };
}

export function membershipRowToOrganizationUser(
  membership: DbOrganizationMembership,
  profile?: {
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    platformRole?: PlatformRole | null;
    createdAt?: string | null;
    lastSignInAt?: string | null;
  },
): OrganizationUser {
  return {
    id: membership.user_id,
    email: profile?.email ?? null,
    firstName: profile?.firstName ?? null,
    lastName: profile?.lastName ?? null,
    orgRole: membership.org_role as OrganizationRole,
    platformRole: profile?.platformRole ?? "none",
    adminPermissions:
      (membership.admin_permissions as AdminPermissions | null) ?? null,
    createdAt: profile?.createdAt ?? new Date(0).toISOString(),
    lastSignInAt: profile?.lastSignInAt ?? null,
    updatedAt: membership.updated_at ?? null,
    departmentIds: membership.department_ids ?? [],
    deptAdminIds: membership.dept_admin_ids ?? [],
  };
}

export function rowToInvitation(row: DbInvitation): Invitation {
  return {
    id: row.id,
    orgId: row.org_id,
    invitedBy: row.invited_by ?? null,
    email: row.email,
    roleToAssign: row.role_to_assign as AssignableOrganizationRole,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
    employeeId: row.employee_id ?? null,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    phone: row.phone ?? null,
    departmentIds: row.department_ids ?? [],
    deptAdminIds: row.dept_admin_ids ?? [],
  };
}

export function rowToFocusArea(row: DbFocusArea): FocusArea {
  return {
    id: row.id,
    orgId: row.org_id,
    departmentId: row.department_id ?? null,
    name: row.name,
    color: normalizePresetBg(row.color),
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToShiftCategory(row: DbShiftCategory): ShiftCategory {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr ?? null,
    startTime: trimTime(row.start_time) ?? null,
    endTime: trimTime(row.end_time) ?? null,
    color: normalizePresetBg(row.color),
    sortOrder: row.sort_order,
    focusAreaId: row.focus_area_id ?? null,
    breakMinutes: row.break_minutes ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToJobDefinition(row: DbJobDefinition): JobDefinition {
  const assignmentMode = row.assignment_mode ?? "with_shift";
  const focusAreaIds = row.focus_area_ids ?? [];
  const shiftTimeOverrides = Object.fromEntries(
    Object.entries(row.shift_time_overrides ?? {})
      .filter(([shiftId, value]) => shiftId.trim().length > 0 && value != null)
      .map(([shiftId, value]) => [
        shiftId,
        {
          startTime: trimTime(value.startTime) ?? null,
          endTime: trimTime(value.endTime) ?? null,
        },
      ]),
  );
  const shiftColorOverrides = Object.fromEntries(
    Object.entries(row.shift_color_overrides ?? {})
      .filter(([shiftId, value]) => shiftId.trim().length > 0 && typeof value === "string" && value.trim().length > 0),
  );
  const style =
    assignmentMode === "shiftless"
      ? {
          color: row.color,
          border: row.border_color,
          text: row.text_color,
        }
      : EMPTY_SCHEDULED_JOB_STYLE;
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
    showOnGrid: row.show_on_grid,
    assignmentMode,
    eligibilityMode: row.eligibility_mode ?? "and",
    focusAreaId: focusAreaIds[0] ?? null,
    focusAreaIds,
    departmentIds: row.department_ids ?? [],
    applicableShiftIds: row.applicable_shift_ids ?? [],
    eligibleRoleIds: row.eligible_role_ids ?? [],
    requiredCertificationIds: row.required_certification_ids ?? [],
    color: style.color,
    border: style.border,
    text: style.text,
    shiftTimeOverrides,
    shiftColorOverrides,
    defaultStartTime: trimTime(row.default_start_time) ?? null,
    defaultEndTime: trimTime(row.default_end_time) ?? null,
    defaultDurationHours: row.default_duration_hours ?? null,
    defaultDurationMinutes: row.default_duration_minutes ?? null,
    sortOrder: row.sort_order,
    systemKey: row.system_key ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToCoverageRequirement(row: DbCoverageRequirement): CoverageRequirement {
  return {
    id: row.id,
    orgId: row.org_id,
    focusAreaId: row.focus_area_id,
    jobId: row.job_id ?? 0,
    preferredShiftId: row.preferred_shift_id ?? null,
    dayOfWeek: row.day_of_week,
    minStaff: row.min_staff,
  };
}

export function rowToAssignmentDefinition(row: DbAssignmentDefinition): AssignmentDefinition {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    name: row.name,
    color: row.color,
    border: row.border_color,
    text: row.text_color,
    categoryId: row.category_id ?? null,
    shiftId: row.shift_id ?? null,
    jobId: row.job_id ?? null,
    isGeneral: row.is_general ?? undefined,
    focusAreaId: row.focus_area_id ?? null,
    sortOrder: row.sort_order,
    requiredCertificationIds: row.required_certification_ids ?? [],
    defaultStartTime: trimTime(row.default_start_time) ?? null,
    defaultEndTime: trimTime(row.default_end_time) ?? null,
    defaultDurationHours: row.default_duration_hours ?? null,
    defaultDurationMinutes: row.default_duration_minutes ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

// ── Absence Types ─────────────────────────────────────────────────────────────

export function rowToAbsenceType(row: DbAbsenceType): AbsenceType {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    name: row.name,
    color: row.color,
    border: row.border_color,
    text: row.text_color,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToEmployee(row: DbEmployee): Employee {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status ?? 'active',
    statusChangedAt: row.status_changed_at ?? null,
    statusNote: row.status_note ?? '',
    certificationId: row.certification_id ?? null,
    roleIds: row.role_ids ?? [],
    seniority: row.seniority,
    focusAreaIds: row.focus_area_ids ?? [],
    phone: row.phone ?? "",
    email: row.email ?? "",
    contactNotes: row.contact_notes ?? "",
    archivedAt: row.archived_at ?? null,
    userId: row.user_id ?? null,
    departmentIds: row.department_ids ?? [],
    deptAdminIds: row.dept_admin_ids ?? [],
    version: row.version ?? 0,
  };
}

export function employeeToRow(emp: Omit<Employee, "id">, orgId: string): Omit<DbEmployee, "id" | "status" | "status_changed_at" | "status_note" | "archived_at" | "user_id" | "version"> {
  return {
    org_id: orgId,
    first_name: emp.firstName,
    last_name: emp.lastName,
    certification_id: emp.certificationId,
    role_ids: emp.roleIds ?? [],
    seniority: emp.seniority,
    focus_area_ids: emp.focusAreaIds ?? [],
    phone: emp.phone,
    email: emp.email,
    contact_notes: emp.contactNotes,
    department_ids: emp.departmentIds ?? [],
    dept_admin_ids: emp.deptAdminIds ?? [],
  };
}

// ── Indicator Types ───────────────────────────────────────────────────────────

export function rowToIndicatorType(row: DbIndicatorType): IndicatorType {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

function normalizeScheduleCellState(
  state: ScheduleCellInput,
  overrides?: Partial<Pick<ScheduleCellInput, "seriesId" | "fromRecurring">>,
): ScheduleCellInput {
  const seriesId = overrides?.seriesId ?? state.seriesId ?? null;
  const fromRecurring = overrides?.fromRecurring ?? state.fromRecurring ?? false;

  if (state.kind === "deleted") {
    return {
      kind: "deleted",
      segments: [],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId,
      fromRecurring,
    };
  }

  if (state.kind === "absence") {
    return {
      kind: "absence",
      segments: [],
      absenceTypeId: state.absenceTypeId ?? null,
      customStartTime: null,
      customEndTime: null,
      seriesId,
      fromRecurring,
    };
  }

  return {
    kind: "worked",
    segments: [...state.segments]
      .sort((left, right) => left.position - right.position)
      .map((segment, index) => ({
        shiftId: segment.shiftId,
        jobId: segment.jobId,
        position: index,
      })),
    absenceTypeId: null,
    customStartTime: state.customStartTime ?? null,
    customEndTime: state.customEndTime ?? null,
    seriesId,
    fromRecurring,
  };
}

function getScheduleAssignments(state: ScheduleCellInput): {
  shiftIds: Array<number | null>;
  jobIds: number[];
} {
  if (state.kind !== "worked") {
    return {
      shiftIds: [],
      jobIds: [],
    };
  }

  const orderedSegments = [...state.segments].sort(
    (left, right) => left.position - right.position,
  );
  return {
    shiftIds: orderedSegments.map((segment) => segment.shiftId),
    jobIds: orderedSegments.map((segment) => segment.jobId),
  };
}

function buildFallbackSegments(
  state: ScheduleCellInput,
  assignmentIds: number[],
): ShiftJobSegment[] {
  if (state.kind !== "worked") {
    return [];
  }

  return [...state.segments]
    .sort((left, right) => left.position - right.position)
    .map((segment, index) => ({
      shiftId: segment.shiftId,
      jobId: segment.jobId,
      position: index,
      assignmentId: assignmentIds[index] ?? null,
      label: "",
      shiftName: null,
      shiftAbbr: null,
      jobName: null,
      jobAbbr: null,
      focusAreaId: null,
      showJobOnGrid: true,
      isShiftless: segment.shiftId == null,
      startTime: null,
      endTime: null,
    }));
}

function resolveSegmentsAndAssignmentDefinitions(
  state: ScheduleCellInput,
  segmentCompatibility?: SegmentCompatibilityMaps | null,
  assignmentIdByPair?: Map<string, number>,
): {
  shiftIds: Array<number | null>;
  jobIds: number[];
  assignmentIds: number[];
  segments: ShiftJobSegment[];
} {
  const { shiftIds, jobIds } = getScheduleAssignments(state);
  const derivedAssignmentDefinitionIds = deriveAssignmentDefinitionIdsFromAssignments(
    { shiftIds, jobIds },
    assignmentIdByPair ?? new Map(),
  );
  const segments =
    state.kind === "worked"
      ? segmentCompatibility
        ? resolveShiftJobSegments(
            {
              shiftIds,
              jobIds,
              assignmentIds: derivedAssignmentDefinitionIds,
            },
            segmentCompatibility,
          )
        : buildFallbackSegments(state, derivedAssignmentDefinitionIds)
      : [];

  return {
    shiftIds,
    jobIds,
    assignmentIds: derivedAssignmentDefinitionIds,
    segments,
  };
}

function buildResolvedPresentation(
  state: ScheduleCellInput,
  args: {
    codeMap: Map<number, string>;
    absenceTypeMap?: Map<number, string>;
    segments: ShiftJobSegment[];
    assignmentIds: number[];
  },
): ResolvedSchedulePresentation {
  if (state.kind === "deleted") {
    return {
      label: "",
      startTime: null,
      endTime: null,
      segments: [],
    };
  }

  if (state.kind === "absence") {
    return {
      label: args.absenceTypeMap?.get(state.absenceTypeId ?? -1) ?? "?",
      startTime: null,
      endTime: null,
      segments: [],
    };
  }

  const hasSegmentLabels = args.segments.some(
    (segment) => segment.label.trim().length > 0,
  );
  const segmentLabel =
    args.segments.length > 0 && hasSegmentLabels
      ? joinShiftJobSegmentLabels(args.segments).trim()
      : "";
  const label =
    segmentLabel.length > 0
      ? segmentLabel
      : resolveCodeLabels(args.assignmentIds, args.codeMap);
  const firstSegment = args.segments[0] ?? null;
  const lastSegment = args.segments.at(-1) ?? null;

  return {
    label,
    shiftName: firstSegment?.shiftName ?? null,
    focusAreaId: firstSegment?.focusAreaId ?? null,
    focusAreaName: null,
    displayFocusAreaName: null,
    startTime: state.customStartTime ?? firstSegment?.startTime ?? null,
    endTime: state.customEndTime ?? lastSegment?.endTime ?? null,
    segments: args.segments.map((segment, index) => ({
      shiftId: segment.shiftId,
      jobId: segment.jobId,
      label:
        segment.label ||
        (args.assignmentIds[index] != null
          ? (args.codeMap.get(args.assignmentIds[index]) ?? "")
          : ""),
      shiftName: segment.shiftName,
      jobName: segment.jobName,
      startTime: segment.startTime ?? null,
      endTime: segment.endTime ?? null,
      displayFocusAreaName: null,
    })),
  };
}

// ── Recurring Shifts ──────────────────────────────────────────────────────────

export function rowToRecurringShift(
  row: DbRecurringShift,
  codeMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
  segmentCompatibility?: SegmentCompatibilityMaps | null,
  assignmentIdByPair?: Map<string, number>,
): RecurringShift {
  const input = normalizeScheduleCellState(row.state, { fromRecurring: true });
  const {
    assignmentIds,
    segments,
  } = resolveSegmentsAndAssignmentDefinitions(
    input,
    segmentCompatibility,
    assignmentIdByPair,
  );
  const presentation = buildResolvedPresentation(input, {
    codeMap,
    absenceTypeMap,
    segments,
    assignmentIds,
  });

  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    dayOfWeek: row.day_of_week,
    state: input,
    presentation,
    input,
    absenceTypeId: input.kind === "absence" ? (input.absenceTypeId ?? null) : null,
    shiftLabel: presentation.label,
    effectiveFrom: row.effective_from,
    effectiveUntil: row.effective_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
  };
}

// ── Shift Requests ────────────────────────────────────────────────────────────

export function rowToShiftRequest(
  row: DbShiftRequest,
  assignmentLabelMap: Map<number, string>,
  segmentCompatibility?: SegmentCompatibilityMaps | null,
  assignmentIdByPair?: Map<string, number>,
): ShiftRequest {
  const requesterState = normalizeScheduleCellState(row.requester_state);
  const targetState =
    row.target_state != null
      ? normalizeScheduleCellState(row.target_state)
      : null;
  const requesterResolved = resolveSegmentsAndAssignmentDefinitions(
    requesterState,
    segmentCompatibility,
    assignmentIdByPair,
  );
  const targetResolved =
    targetState != null
      ? resolveSegmentsAndAssignmentDefinitions(
          targetState,
          segmentCompatibility,
          assignmentIdByPair,
        )
      : null;
  const resolvedRequesterAssignmentDefinitionIds = requesterResolved.assignmentIds;
  const resolvedTargetAssignmentDefinitionIds =
    targetState != null ? (targetResolved?.assignmentIds ?? []) : [];
  const requesterSegments = requesterResolved.segments;
  const targetSegments = targetResolved?.segments ?? null;
  const requesterFocusAreaId =
    requesterSegments.find((segment) => segment.focusAreaId != null)
      ?.focusAreaId ?? null;
  const targetFocusAreaId =
    targetSegments?.find((segment) => segment.focusAreaId != null)
      ?.focusAreaId ?? null;
  const requesterPresentation = buildResolvedPresentation(requesterState, {
    codeMap: assignmentLabelMap,
    segments: requesterSegments,
    assignmentIds: resolvedRequesterAssignmentDefinitionIds,
  });
  const targetPresentation =
    targetState != null
      ? buildResolvedPresentation(targetState, {
          codeMap: assignmentLabelMap,
          segments: targetSegments ?? [],
          assignmentIds: resolvedTargetAssignmentDefinitionIds,
        })
      : null;

  return {
    id: row.id,
    orgId: row.org_id,
    type: row.type,
    status: row.status,
    requesterEmpId: row.requester_emp_id,
    requesterName: [row.requester_first_name, row.requester_last_name]
      .filter(Boolean)
      .join(" ") || "Unknown",
    requesterShiftDate: row.requester_shift_date,
    requesterState,
    requesterPresentation,
    requesterShiftIds: requesterResolved.shiftIds,
    requesterJobIds: requesterResolved.jobIds,
    requesterSegments,
    requesterAssignmentDefinitionIds: resolvedRequesterAssignmentDefinitionIds,
    requesterShiftLabel: requesterPresentation.label,
    requesterFocusAreaId,
    requesterCustomStartTime: requesterState.customStartTime ?? null,
    requesterCustomEndTime: requesterState.customEndTime ?? null,
    targetEmpId: row.target_emp_id,
    targetName: row.target_first_name
      ? [row.target_first_name, row.target_last_name]
          .filter(Boolean)
          .join(" ")
      : null,
    targetShiftDate: row.target_shift_date,
    targetState,
    targetPresentation,
    targetShiftIds: targetResolved?.shiftIds ?? null,
    targetJobIds: targetResolved?.jobIds ?? null,
    targetSegments,
    targetAssignmentDefinitionIds: targetState ? resolvedTargetAssignmentDefinitionIds : null,
    targetShiftLabel: targetState
      ? targetPresentation?.label ?? resolveCodeLabels(resolvedTargetAssignmentDefinitionIds, assignmentLabelMap)
      : null,
    targetFocusAreaId,
    targetCustomStartTime: targetState?.customStartTime ?? null,
    targetCustomEndTime: targetState?.customEndTime ?? null,
    absenceTypeId: row.absence_type_id,
    parentRequestId: row.parent_request_id,
    adminUserId: row.admin_user_id,
    adminNote: row.admin_note,
    expiresAt: row.expires_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Series Date Generation ────────────────────────────────────────────────────

export function generateSeriesDates(
  frequency: SeriesFrequency,
  daysOfWeek: number[] | null,
  startDate: string,
  endDate: string | null,
  maxOccurrences: number | null,
): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00');
  const cap = maxOccurrences ?? MAX_SERIES_OCCURRENCES;

  // Compute an upper-bound end date for iteration if none specified
  const maxEnd = endDate
    ? new Date(endDate + 'T00:00:00')
    : new Date(start.getFullYear(), start.getMonth() + 7, start.getDate()); // ~7 months
  const startDayOfWeek = new Date(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())).getUTCDay();

  // DST-safe iteration using UTC arithmetic
  for (const { dateKey, dayOfWeek, dayIndex } of iterateDateRange(start, maxEnd)) {
    if (dates.length >= cap) break;

    let include = false;
    const dayMatch = (daysOfWeek === null || daysOfWeek.length === 0)
      ? dayOfWeek === startDayOfWeek
      : daysOfWeek.includes(dayOfWeek);

    if (frequency === 'daily') {
      include = true;
    } else if (frequency === 'weekly') {
      include = dayMatch;
    } else if (frequency === 'biweekly') {
      // dayIndex is a reliable day counter (immune to DST)
      const weekNum = Math.floor(dayIndex / 7);
      include = weekNum % 2 === 0 && dayMatch;
    }

    if (include) dates.push(dateKey);
  }

  return dates;
}
