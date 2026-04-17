import type {
  Department,
  DepartmentType,
  Employee,
  Organization,
  OrganizationUser,
  FocusArea,
  ShiftCategory,
  ShiftCode,
  AbsenceType,
  IndicatorType,
  Invitation,
  RecurringShift,
  ShiftRequest,
  NamedItem,
  CoverageRequirement,
  CoverageRuleConfig,
  SeriesFrequency,
} from "@/types";
import type {
  DbOrganization,
  DbFocusArea,
  DbDepartment,
  DbShiftCategory,
  DbCoverageRequirement,
  DbCoverageRuleConfig,
  DbCoverageRuleConfigCode,
  DbShiftCode,
  DbAbsenceType,
  DbEmployee,
  DbIndicatorType,
  DbInvitation,
  DbOrganizationMembership,
  DbRecurringShift,
  DbShiftRequest,
  DbNamedItem,
} from "./types";
import { trimTime, resolveCodeLabels, iterateDateRange, MAX_SERIES_OCCURRENCES } from "./shared";
import { composeOrganizationAddress } from "@/lib/organization-profile";

// ── Named Item (certifications / organization_roles) ─────────────────────────

export function rowToNamedItem(row: DbNamedItem): NamedItem {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbr: row.abbr,
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
    permissions: (row.permissions as unknown as import("@/types").AdminPermissions) ?? null,
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
    departmentLabel: row.department_label ?? 'Departments',
    shiftDisplayMode: (row.shift_display_mode as import("@/types").ShiftDisplayMode) ?? 'code',
    timezone: row.timezone ?? null,
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
    orgRole: (row.org_role as import("@/types").OrganizationRole) ?? "user",
    platformRole: (row.platform_role as import("@/types").PlatformRole) ?? "none",
    adminPermissions: (row.admin_permissions as import("@/types").AdminPermissions | null) ?? null,
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
    platformRole?: import("@/types").PlatformRole | null;
    createdAt?: string | null;
    lastSignInAt?: string | null;
  },
): OrganizationUser {
  return {
    id: membership.user_id,
    email: profile?.email ?? null,
    firstName: profile?.firstName ?? null,
    lastName: profile?.lastName ?? null,
    orgRole: membership.org_role as import("@/types").OrganizationRole,
    platformRole: profile?.platformRole ?? "none",
    adminPermissions:
      (membership.admin_permissions as import("@/types").AdminPermissions | null) ?? null,
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
    roleToAssign: row.role_to_assign as import("@/types").AssignableOrganizationRole,
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
    sortOrder: row.sort_order,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToShiftCategory(row: DbShiftCategory): ShiftCategory {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    color: row.color,
    startTime: trimTime(row.start_time) ?? null,
    endTime: trimTime(row.end_time) ?? null,
    sortOrder: row.sort_order,
    focusAreaId: row.focus_area_id ?? null,
    breakMinutes: row.break_minutes ?? null,
    archivedAt: row.archived_at ?? null,
  };
}

export function rowToCoverageRequirement(row: DbCoverageRequirement): CoverageRequirement {
  return {
    id: row.id,
    orgId: row.org_id,
    focusAreaId: row.focus_area_id,
    shiftCodeId: row.shift_code_id,
    dayOfWeek: row.day_of_week,
    minStaff: row.min_staff,
  };
}

export function rowsToCoverageRuleConfig(
  row: DbCoverageRuleConfig,
  codeRows: DbCoverageRuleConfigCode[],
): CoverageRuleConfig {
  return {
    id: row.id,
    orgId: row.org_id,
    focusAreaId: row.focus_area_id,
    requirementShiftCodeId: row.requirement_shift_code_id,
    eligibleShiftCodeIds: codeRows.map((code) => code.eligible_shift_code_id),
    preferredOpenShiftCodeId: row.preferred_open_shift_code_id,
  };
}

export function rowToShiftCode(row: DbShiftCode): ShiftCode {
  return {
    id: row.id,
    orgId: row.org_id,
    label: row.label,
    name: row.name,
    color: row.color,
    border: row.border_color,
    text: row.text_color,
    categoryId: row.category_id ?? null,
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

// ── Recurring Shifts ──────────────────────────────────────────────────────────

export function rowToRecurringShift(
  row: DbRecurringShift,
  codeMap: Map<number, string>,
  absenceTypeMap?: Map<number, string>,
): RecurringShift {
  let label = '?';
  if (row.shift_code_id != null) {
    label = codeMap.get(row.shift_code_id) ?? '?';
  } else if (row.absence_type_id != null) {
    label = absenceTypeMap?.get(row.absence_type_id) ?? '?';
  }
  return {
    id: row.id,
    empId: row.emp_id,
    orgId: row.org_id,
    dayOfWeek: row.day_of_week,
    shiftCodeId: row.shift_code_id,
    absenceTypeId: row.absence_type_id,
    shiftLabel: label,
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
  shiftCodeMap: Map<number, string>
): ShiftRequest {
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
    requesterShiftCodeIds: row.requester_shift_code_ids ?? [],
    requesterShiftLabel: resolveCodeLabels(
      row.requester_shift_code_ids ?? [],
      shiftCodeMap
    ),
    requesterFocusAreaId: row.requester_focus_area_id,
    requesterCustomStartTime: row.requester_custom_start_time,
    requesterCustomEndTime: row.requester_custom_end_time,
    targetEmpId: row.target_emp_id,
    targetName: row.target_first_name
      ? [row.target_first_name, row.target_last_name]
          .filter(Boolean)
          .join(" ")
      : null,
    targetShiftDate: row.target_shift_date,
    targetShiftCodeIds: row.target_shift_code_ids,
    targetShiftLabel: row.target_shift_code_ids
      ? resolveCodeLabels(row.target_shift_code_ids, shiftCodeMap)
      : null,
    targetFocusAreaId: row.target_focus_area_id,
    targetCustomStartTime: row.target_custom_start_time,
    targetCustomEndTime: row.target_custom_end_time,
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
