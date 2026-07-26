// Pin the runtime timezone to UTC (matching production servers) so the
// ISO date round-trips in resolveMobileDateRange/getMobileDatesBetween are
// stable regardless of the local machine timezone the suite runs on.
process.env.TZ = "UTC";

import { describe, expect, it, vi } from "vitest";
import {
  fetchMobileCoverageSummary,
  fetchMobileOpenShifts,
  fetchMobilePeople,
  fetchMobileScheduleEntries,
  fetchMobileShiftRequests,
} from "./data";

function createThenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (error: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };

  return query;
}

function buildMockShiftCategoryRows(
  assignments: Array<{
    shiftId?: number | null;
    label: string;
    name: string;
    focusAreaId: number | null;
    defaultStartTime: string | null;
    defaultEndTime: string | null;
  }>,
) {
  const seen = new Set<number>();

  return assignments
    .filter((assignment) => assignment.shiftId != null)
    .filter((assignment) => {
      const shiftId = assignment.shiftId as number;
      if (seen.has(shiftId)) return false;
      seen.add(shiftId);
      return true;
    })
    .map((assignment, index) => ({
      id: assignment.shiftId as number,
      org_id: "org-1",
      name: assignment.name,
      abbr: assignment.label,
      color: "#eff6ff",
      start_time: assignment.defaultStartTime,
      end_time: assignment.defaultEndTime,
      sort_order: index,
      focus_area_id: assignment.focusAreaId,
      break_minutes: null,
      archived_at: null,
    }));
}

function buildMockJobRows(
  assignments: Array<{
    label: string;
    name: string;
    shiftId?: number | null;
    jobId?: number | null;
    defaultStartTime?: string | null;
    defaultEndTime?: string | null;
  }>,
  explicitJobs?: Array<{
    id: number;
    name: string;
    color?: string | null;
    borderColor?: string | null;
    defaultDurationHours?: number | null;
    defaultDurationMinutes?: number | null;
    eligibleRoleIds?: number[];
    requiredCertificationIds?: number[];
    sortOrder?: number;
    textColor?: string | null;
  }>,
) {
  const explicitJobMap = new Map((explicitJobs ?? []).map((job) => [job.id, job]));
  const uniqueJobIds = Array.from(
    new Set(
      assignments
        .map((assignment) => assignment.jobId ?? null)
        .filter((jobId): jobId is number => jobId != null),
    ),
  );

  return uniqueJobIds.map((jobId, index) => {
    const explicitJob = explicitJobMap.get(jobId);
    const matchingAssignments = assignments.filter((assignment) => assignment.jobId === jobId);
    const fallbackAssignment = matchingAssignments[0];
    const hasWorkedShift = matchingAssignments.some((assignment) => assignment.shiftId != null);

    return {
      id: jobId,
      org_id: "org-1",
      name: explicitJob?.name ?? fallbackAssignment?.name ?? `Job ${jobId}`,
      abbr:
        explicitJob?.name?.slice(0, 3).toUpperCase() ?? fallbackAssignment?.label ?? `J${jobId}`,
      show_on_grid: false,
      assignment_mode: hasWorkedShift ? "with_shift" : "shiftless",
      eligibility_mode: "and",
      focus_area_ids: [],
      department_ids: [],
      applicable_shift_ids: [],
      eligible_role_ids: explicitJob?.eligibleRoleIds ?? [],
      required_certification_ids: explicitJob?.requiredCertificationIds ?? [],
      color: explicitJob?.color ?? "#eff6ff",
      border_color: explicitJob?.borderColor ?? "#60a5fa",
      text_color: explicitJob?.textColor ?? "#1d4ed8",
      shift_time_overrides: {},
      shift_color_overrides: {},
      default_start_time: hasWorkedShift ? null : (fallbackAssignment?.defaultStartTime ?? null),
      default_end_time: hasWorkedShift ? null : (fallbackAssignment?.defaultEndTime ?? null),
      default_duration_hours: explicitJob?.defaultDurationHours ?? null,
      default_duration_minutes: explicitJob?.defaultDurationMinutes ?? null,
      sort_order: explicitJob?.sortOrder ?? index,
      system_key: null,
      archived_at: null,
    };
  });
}

function createServiceClientForSchedule(
  employeeRelation: unknown,
  options?: {
    absenceTypeId?: number | null;
    customEndTime?: string | null;
    customStartTime?: string | null;
    jobIds?: number[];
    mentoredFlags?: boolean[];
    jobs?: Array<{
      id: number;
      name: string;
      color?: string | null;
      borderColor?: string | null;
      defaultDurationHours?: number | null;
      defaultDurationMinutes?: number | null;
      eligibleRoleIds?: number[];
      requiredCertificationIds?: number[];
      sortOrder?: number;
      textColor?: string | null;
    }>;
    shiftIds?: Array<number | null>;
    assignmentIds?: number[];
    assignments?: Array<{
      id: number;
      label: string;
      name: string;
      categoryId?: number | null;
      shiftId?: number | null;
      jobId?: number | null;
      focusAreaId: number | null;
      defaultStartTime: string | null;
      defaultEndTime: string | null;
    }>;
    shiftFocusAreaId?: number | null;
    assignmentFocusAreaId?: number | null;
    employeeFocusAreaIds?: number[];
    organizationRoles?: Array<{
      id: number;
      name: string;
      sortOrder: number;
      isScheduleRole?: boolean;
    }>;
    certifications?: Array<{
      id: number;
      name: string;
      sortOrder: number;
    }>;
  },
) {
  const assignments = options?.assignments ?? [
    {
      id: 44,
      label: "D",
      name: "Day Shift",
      categoryId: options?.shiftIds?.[0] ?? null,
      shiftId: options?.shiftIds?.[0] ?? null,
      jobId: options?.jobIds?.[0] ?? 91,
      focusAreaId: options?.assignmentFocusAreaId ?? null,
      defaultStartTime: "07:00:00",
      defaultEndTime: "15:00:00",
    },
  ];
  const absencesQuery = createThenableQuery({
    data: [
      {
        id: 56,
        label: "X",
        name: "Off",
        color: "#fef3c7",
        border_color: "#f59e0b",
        text_color: "#92400e",
      },
    ],
    error: null,
  });
  const focusAreasQuery = createThenableQuery({
    data: [
      {
        id: 12,
        org_id: "org-1",
        department_id: null,
        name: "Skilled Nursing",
        color: "#eff6ff",
        sort_order: 0,
        archived_at: null,
      },
    ],
    error: null,
  });
  const shiftCategoriesQuery = createThenableQuery({
    data: buildMockShiftCategoryRows(assignments),
    error: null,
  });
  const jobsQuery = createThenableQuery({
    data: buildMockJobRows(assignments, options?.jobs),
    error: null,
  });
  const organizationRolesQuery = createThenableQuery({
    data: (options?.organizationRoles ?? []).map((role) => ({
      id: role.id,
      org_id: "org-1",
      name: role.name,
      abbr: role.name.slice(0, 3).toUpperCase(),
      is_schedule_role: role.isScheduleRole ?? true,
      department_id: null,
      sort_order: role.sortOrder,
      archived_at: null,
    })),
    error: null,
  });
  const certificationsQuery = createThenableQuery({
    data: (options?.certifications ?? []).map((certification) => ({
      id: certification.id,
      org_id: "org-1",
      name: certification.name,
      abbr: certification.name.slice(0, 3).toUpperCase(),
      department_id: null,
      sort_order: certification.sortOrder,
      archived_at: null,
    })),
    error: null,
  });
  const publishHistoryQuery = createThenableQuery({
    data: [
      {
        published_by: "user-1",
        start_date: "2026-04-16",
        end_date: "2026-04-22",
        published_at: "2026-04-15T18:30:00.000Z",
      },
    ],
    error: null,
  });
  const profilesQuery = createThenableQuery({
    data: [
      {
        id: "user-1",
        first_name: "Mina",
        last_name: "Diaz",
      },
    ],
    error: null,
  });
  const scheduleCellsQuery = createThenableQuery({
    data: [
      {
        id: "cell-1",
        emp_id: "196d610f-2283-486c-a9e0-197852969a31",
        date: "2026-04-18",
        org_id: "org-1",
        focus_area_id:
          options && "shiftFocusAreaId" in options ? (options.shiftFocusAreaId ?? null) : 12,
        version: 1,
        series_id: null,
        from_recurring: false,
        created_by: null,
        updated_by: null,
        created_at: null,
        updated_at: null,
        snapshots: [
          {
            id: "published-snapshot",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "published",
            state_kind: options?.absenceTypeId != null ? "absence" : "worked",
            absence_type_id: options?.absenceTypeId ?? null,
            custom_start_time: options?.customStartTime ?? null,
            custom_end_time: options?.customEndTime ?? null,
            segments:
              options?.absenceTypeId != null
                ? []
                : (options?.assignmentIds ?? [44]).map((assignmentId, index) => ({
                    id: `segment-${index}`,
                    snapshot_id: "published-snapshot",
                    org_id: "org-1",
                    position: index,
                    shift_id: options?.shiftIds?.[index] ?? null,
                    job_id: options?.jobIds?.[index] ?? 91,
                    is_mentored: options?.mentoredFlags?.[index] ?? false,
                  })),
          },
        ],
        employees: employeeRelation,
      },
    ],
    error: null,
  });
  const employeesQuery = createThenableQuery({
    data: [
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        focus_area_ids: options?.employeeFocusAreaIds ?? [12],
      },
    ],
    error: null,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "employees") {
        return employeesQuery;
      }
      if (table === "absence_types") {
        return absencesQuery;
      }
      if (table === "focus_areas") {
        return focusAreasQuery;
      }
      if (table === "shift_categories") {
        return shiftCategoriesQuery;
      }
      if (table === "jobs") {
        return jobsQuery;
      }
      if (table === "organization_roles") {
        return organizationRolesQuery;
      }
      if (table === "certifications") {
        return certificationsQuery;
      }
      if (table === "publish_history") {
        return publishHistoryQuery;
      }
      if (table === "profiles") {
        return profilesQuery;
      }
      if (table === "schedule_cells") {
        return scheduleCellsQuery;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn((fn: string) => {
      throw new Error(`Unexpected rpc ${fn}`);
    }),
  };
}

function createServiceClientForShiftRequests() {
  const assignments = [
    {
      id: 44,
      label: "D",
      name: "Day Shift",
      shiftId: 101,
      jobId: 91,
      focusAreaId: 12,
      defaultStartTime: "07:00:00",
      defaultEndTime: "15:00:00",
    },
    {
      id: 45,
      label: "E",
      name: "Evening Shift",
      shiftId: 102,
      jobId: 92,
      focusAreaId: 12,
      defaultStartTime: "15:00:00",
      defaultEndTime: "23:00:00",
    },
  ];
  const focusAreasQuery = createThenableQuery({
    data: [
      {
        id: 12,
        org_id: "org-1",
        department_id: null,
        name: "Skilled Nursing",
        color: "#eff6ff",
        sort_order: 0,
        archived_at: null,
      },
    ],
    error: null,
  });
  const shiftCategoriesQuery = createThenableQuery({
    data: buildMockShiftCategoryRows(assignments),
    error: null,
  });
  const jobsQuery = createThenableQuery({
    data: buildMockJobRows(assignments, [
      { id: 91, name: "Nurse" },
      { id: 92, name: "Mentor" },
    ]),
    error: null,
  });
  const organizationRolesQuery = createThenableQuery({
    data: [],
    error: null,
  });
  const certificationsQuery = createThenableQuery({
    data: [],
    error: null,
  });
  const requestsQuery = createThenableQuery({
    data: [
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
        type: "pickup",
        status: "open",
        requester_emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        requester_shift_date: "2026-04-23",
        requester_state: {
          kind: "worked",
          segments: [{ shiftId: 101, jobId: 91, position: 0 }],
          absenceTypeId: null,
          customStartTime: "07:15:00",
          customEndTime: "15:45:00",
          seriesId: null,
          fromRecurring: false,
        },
        target_emp_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        target_shift_date: "2026-04-24",
        target_state: {
          kind: "worked",
          segments: [{ shiftId: 102, jobId: 92, position: 0, isMentored: true }],
          absenceTypeId: null,
          customStartTime: "15:30:00",
          customEndTime: "23:30:00",
          seriesId: null,
          fromRecurring: false,
        },
        absence_type_id: null,
        parent_request_id: null,
        admin_user_id: null,
        admin_note: null,
        expires_at: "2026-04-25T12:00:00.000Z",
        resolved_at: null,
        created_at: "2026-04-20T12:00:00.000Z",
        updated_at: "2026-04-20T12:00:00.000Z",
        requester: {
          first_name: "Sarah",
          last_name: "Jenkins",
        },
        target: {
          first_name: "Nic",
          last_name: "Kosmas",
        },
      },
    ],
    error: null,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "focus_areas") {
        return focusAreasQuery;
      }
      if (table === "shift_categories") {
        return shiftCategoriesQuery;
      }
      if (table === "jobs") {
        return jobsQuery;
      }
      if (table === "organization_roles") {
        return organizationRolesQuery;
      }
      if (table === "certifications") {
        return certificationsQuery;
      }
      if (table === "shift_requests") {
        return requestsQuery;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    requestsQuery,
  };
}

function createServiceClientForOpenShifts(options?: {
  minStaff?: number;
  shiftRequests?: unknown[];
  scheduleCells?: unknown[];
}) {
  const assignments = [
    {
      id: 44,
      label: "D",
      name: "Day Shift",
      shiftId: 101,
      jobId: 91,
      focusAreaId: 12,
      defaultStartTime: "07:00:00",
      defaultEndTime: "15:00:00",
    },
  ];
  const focusAreasQuery = createThenableQuery({
    data: [
      {
        id: 12,
        org_id: "org-1",
        department_id: null,
        name: "Skilled Nursing",
        color: "#eff6ff",
        sort_order: 0,
        archived_at: null,
      },
    ],
    error: null,
  });
  const shiftCategoriesQuery = createThenableQuery({
    data: buildMockShiftCategoryRows(assignments),
    error: null,
  });
  const jobsQuery = createThenableQuery({
    data: buildMockJobRows(assignments, [
      {
        id: 91,
        name: "Charge Nurse",
        eligibleRoleIds: [777],
      },
    ]),
    error: null,
  });
  const namedItemsQuery = createThenableQuery({
    data: [],
    error: null,
  });
  const publishHistoryQuery = createThenableQuery({
    data: [
      {
        published_by: "user-1",
        start_date: "2026-04-16",
        end_date: "2026-04-16",
        published_at: "2026-04-15T18:30:00.000Z",
      },
    ],
    error: null,
  });
  const profilesQuery = createThenableQuery({
    data: [
      {
        id: "user-1",
        first_name: "Mina",
        last_name: "Diaz",
      },
    ],
    error: null,
  });
  const coverageRequirementsQuery = createThenableQuery({
    data: [
      {
        id: 1,
        org_id: "org-1",
        focus_area_id: 12,
        job_id: 91,
        preferred_shift_id: 101,
        day_of_week: null,
        min_staff: options?.minStaff ?? 1,
      },
    ],
    error: null,
  });
  const organizationQuery = createThenableQuery({
    data: {
      coverage_rule_config: { mentoredCoverageCreditPercent: 100 },
    },
    error: null,
  });
  const employeesQuery = createThenableQuery({
    data: [
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        org_id: "org-1",
        first_name: "Nic",
        last_name: "Kosmas",
        status: "active",
        status_changed_at: null,
        status_note: null,
        certification_id: null,
        role_ids: [],
        seniority: 1,
        focus_area_ids: [12],
        phone: null,
        email: "nic@example.com",
        contact_notes: null,
        archived_at: null,
        user_id: "user-1",
        department_ids: [],
        dept_admin_ids: [],
        version: 1,
      },
    ],
    error: null,
  });
  const scheduleCellsQuery = createThenableQuery({
    data: options?.scheduleCells ?? [],
    error: null,
  });
  const shiftRequestsQuery = createThenableQuery({
    data: options?.shiftRequests ?? [],
    error: null,
  });

  return {
    from: vi.fn((table: string) => {
      if (table === "focus_areas") {
        return focusAreasQuery;
      }
      if (table === "shift_categories") {
        return shiftCategoriesQuery;
      }
      if (table === "jobs") {
        return jobsQuery;
      }
      if (table === "organization_roles" || table === "certifications") {
        return namedItemsQuery;
      }
      if (table === "publish_history") {
        return publishHistoryQuery;
      }
      if (table === "profiles") {
        return profilesQuery;
      }
      if (table === "organizations") {
        return organizationQuery;
      }
      if (table === "coverage_requirements") {
        return coverageRequirementsQuery;
      }
      if (table === "employees") {
        return employeesQuery;
      }
      if (table === "schedule_cells") {
        return scheduleCellsQuery;
      }
      if (table === "shift_requests") {
        return shiftRequestsQuery;
      }

      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn((fn: string) => {
      throw new Error(`Unexpected rpc ${fn}`);
    }),
  };
}

function createPendingOpenShiftVolunteerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    org_id: "org-1",
    type: "pickup",
    status: "pending_approval",
    requester_emp_id: "196d610f-2283-486c-a9e0-197852969a31",
    requester_shift_date: "2026-04-16",
    requester_state: {
      kind: "worked",
      focusAreaId: 12,
      segments: [
        {
          shiftId: 101,
          jobId: 91,
          position: 0,
          isMentored: false,
        },
      ],
      absenceTypeId: null,
      customStartTime: null,
      customEndTime: null,
      seriesId: null,
      fromRecurring: false,
    },
    target_emp_id: null,
    target_shift_date: null,
    target_state: null,
    absence_type_id: null,
    parent_request_id: null,
    admin_user_id: null,
    admin_note: null,
    expires_at: "2026-04-17T00:00:00.000Z",
    resolved_at: null,
    created_at: "2026-04-15T18:00:00.000Z",
    updated_at: "2026-04-15T18:00:00.000Z",
    requester: { first_name: "Nic", last_name: "Kosmas" },
    target: null,
    ...overrides,
  };
}

describe("fetchMobilePeople", () => {
  it("maps management departments from memberships instead of scheduled employee departments", async () => {
    const employeesQuery = createThenableQuery({
      data: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          first_name: "Mina",
          last_name: "Diaz",
          employment_type: "full_time",
          status: "active",
          status_changed_at: null,
          status_note: null,
          certification_id: null,
          role_ids: [],
          seniority: 1,
          focus_area_ids: [2],
          department_ids: [4],
          dept_admin_ids: [],
          phone: "",
          email: "mina@example.com",
          contact_notes: "",
          user_id: "10000000-0000-4000-8000-000000000001",
          version: 3,
        },
      ],
      error: null,
    });
    const invitationsQuery = createThenableQuery({ data: [], error: null });
    const membershipsQuery = createThenableQuery({
      data: [
        {
          user_id: "10000000-0000-4000-8000-000000000001",
          department_ids: [10],
          dept_admin_ids: [10],
        },
      ],
      error: null,
    });
    const serviceClient = {
      from: vi.fn((table: string) => {
        if (table === "employees") return employeesQuery;
        if (table === "invitations") return invitationsQuery;
        if (table === "organization_memberships") return membershipsQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const people = await fetchMobilePeople(serviceClient as never, "org-1");

    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      departmentIds: [4],
      managementDepartmentIds: [10],
      managementDeptAdminIds: [10],
    });
  });
});

describe("fetchMobileScheduleEntries", () => {
  it.each([
    {
      name: "object relations returned by many-to-one embeds",
      employeeRelation: {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
    },
    {
      name: "array relations from legacy/mock callers",
      employeeRelation: [
        {
          id: "196d610f-2283-486c-a9e0-197852969a31",
          first_name: "Nic",
          last_name: "Kosmas",
          org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
        },
      ],
    },
  ])(
    "keeps published schedule entries when employees comes back as $name",
    async ({ employeeRelation }) => {
      const serviceClient = createServiceClientForSchedule(employeeRelation);

      const entries = await fetchMobileScheduleEntries(serviceClient as never, {
        orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
        startDate: "2026-04-18",
        endDate: "2026-04-24",
        employeeId: "196d610f-2283-486c-a9e0-197852969a31",
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        employeeId: "196d610f-2283-486c-a9e0-197852969a31",
        employeeName: "Nic Kosmas",
        date: "2026-04-18",
        state: {
          kind: "worked",
          segments: [
            {
              shiftId: null,
              jobId: 91,
              position: 0,
            },
          ],
          absenceTypeId: null,
          customStartTime: null,
          customEndTime: null,
          seriesId: null,
          fromRecurring: false,
        },
        presentation: {
          label: "D",
          shiftName: "Day Shift",
          focusAreaId: 12,
          focusAreaName: "Skilled Nursing",
          displayFocusAreaName: "Skilled Nursing",
          startTime: "07:00",
          endTime: "15:00",
          segments: [
            {
              shiftId: null,
              jobId: 91,
              label: "D",
              shiftName: "Day Shift",
              startTime: "07:00",
              endTime: "15:00",
              displayFocusAreaName: "Skilled Nursing",
            },
          ],
          shiftColor: "#eff6ff",
          shiftBorderColor: "#60a5fa",
          shiftTextColor: "#1d4ed8",
        },
        publishedAt: "2026-04-15T18:30:00.000Z",
        publishedByName: "Mina Diaz",
      });
    },
  );

  it("does not infer a focus area for general mobile entries when the row focus area is null", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        assignmentFocusAreaId: 12,
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.focusAreaId).toBeNull();
    expect(entries[0]?.presentation.focusAreaName).toBeNull();
    expect(entries[0]?.presentation.displayFocusAreaName).toBeNull();
  });

  it("keeps general shifts unassigned when both shift and shift code focus areas are null", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        assignmentFocusAreaId: null,
        employeeFocusAreaIds: [12],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.focusAreaId).toBeNull();
    expect(entries[0]?.presentation.focusAreaName).toBeNull();
    expect(entries[0]?.presentation.displayFocusAreaName).toBeNull();
  });

  it("does not use queried employee home focus areas for general shifts", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        assignmentFocusAreaId: null,
        employeeFocusAreaIds: [12],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.focusAreaId).toBeNull();
    expect(entries[0]?.presentation.focusAreaName).toBeNull();
    expect(entries[0]?.presentation.displayFocusAreaName).toBeNull();
  });

  it("omits display focus areas for absence entries", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        absenceTypeId: 56,
        assignmentIds: [],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.shiftName).toBe("Off");
    expect(entries[0]?.presentation.displayFocusAreaName).toBeNull();
    expect(entries[0]?.presentation.segments).toEqual([
      {
        label: "Off",
        shiftName: "Off",
        startTime: null,
        endTime: null,
        displayFocusAreaName: null,
      },
    ]);
  });

  it("builds separate schedule segments for multi-shift entries", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftFocusAreaId: null,
        assignmentIds: [44, 45],
        shiftIds: [101, 102],
        mentoredFlags: [false, true],
        assignments: [
          {
            id: 44,
            label: "D",
            name: "Day Shift",
            shiftId: 101,
            jobId: 91,
            focusAreaId: 12,
            defaultStartTime: "07:00:00",
            defaultEndTime: "15:00:00",
          },
          {
            id: 45,
            label: "E",
            name: "Evening Shift",
            shiftId: 102,
            jobId: 91,
            focusAreaId: null,
            defaultStartTime: "15:00:00",
            defaultEndTime: "23:00:00",
          },
        ],
        customStartTime: "07:30:00|15:30:00",
        customEndTime: "15:30:00|23:30:00",
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.shiftName).toBe("Day Shift / Evening Shift");
    expect(entries[0]?.presentation.segments).toEqual([
      expect.objectContaining({
        shiftId: 101,
        jobId: 91,
        jobName: "Day Shift",
        jobColor: "#EFF6FF",
        label: "D",
        shiftName: "Day Shift",
        startTime: "07:30:00",
        endTime: "15:30:00",
        displayFocusAreaName: "Skilled Nursing",
      }),
      expect.objectContaining({
        shiftId: 102,
        jobId: 91,
        jobName: "Day Shift",
        jobColor: "#EFF6FF",
        label: "E",
        shiftName: "Evening Shift",
        startTime: "15:30:00",
        endTime: "23:30:00",
        displayFocusAreaName: null,
        isMentored: true,
      }),
    ]);
  });

  it("normalizes stale split custom times after a published shift is reduced to one segment", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftIds: [101],
        jobIds: [91],
        assignments: [
          {
            id: 44,
            label: "D",
            name: "Day Shift",
            shiftId: 101,
            jobId: 91,
            focusAreaId: 12,
            defaultStartTime: "07:00:00",
            defaultEndTime: "15:00:00",
          },
        ],
        customStartTime: "07:00:00|16:00:00",
        customEndTime: "16:30:00|00:00:00",
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.startTime).toBe("07:00:00");
    expect(entries[0]?.presentation.endTime).toBe("16:30:00");
    expect(entries[0]?.presentation.segments).toEqual([
      expect.objectContaining({
        shiftId: 101,
        jobId: 91,
        startTime: "07:00:00",
        endTime: "16:30:00",
      }),
    ]);
  });

  it("adds job names to schedule segments when published job ids are present", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        jobIds: [91],
        jobs: [{ id: 91, name: "Mentor", color: "#fef3c7" }],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.state.segments.map((segment) => segment.jobId)).toEqual([91]);
    expect(entries[0]?.presentation.segments[0]).toMatchObject({
      jobId: 91,
      jobName: "Mentor",
      jobColor: "#fef3c7",
    });
  });

  it("includes duration metadata for shiftless mobile schedule jobs", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      },
      {
        shiftIds: [null],
        jobIds: [91],
        assignments: [
          {
            id: 44,
            label: "ADM",
            name: "Admin",
            shiftId: null,
            jobId: 91,
            focusAreaId: null,
            defaultStartTime: null,
            defaultEndTime: null,
          },
        ],
        jobs: [
          {
            id: 91,
            name: "Admin",
            defaultDurationHours: 2,
            defaultDurationMinutes: 30,
          },
        ],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.presentation.segments[0]).toMatchObject({
      shiftId: null,
      jobId: 91,
      startTime: null,
      endTime: null,
      defaultDurationHours: 2,
      defaultDurationMinutes: 30,
    });
  });

  it("normalizes mobile job seniority by role and certification order", async () => {
    const serviceClient = createServiceClientForSchedule(
      {
        id: "196d610f-2283-486c-a9e0-197852969a31",
        first_name: "Nic",
        last_name: "Kosmas",
        org_id: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
        seniority: 4,
      },
      {
        assignmentIds: [44, 45],
        shiftIds: [101, 101],
        jobIds: [91, 92],
        assignments: [
          {
            id: 44,
            label: "D",
            name: "Day Shift",
            shiftId: 101,
            jobId: 91,
            focusAreaId: 12,
            defaultStartTime: "07:00:00",
            defaultEndTime: "15:00:00",
          },
          {
            id: 45,
            label: "D",
            name: "Day Shift",
            shiftId: 101,
            jobId: 92,
            focusAreaId: 12,
            defaultStartTime: "07:00:00",
            defaultEndTime: "15:00:00",
          },
        ],
        jobs: [
          {
            id: 91,
            name: "Nurse",
            sortOrder: 20,
            eligibleRoleIds: [7],
          },
          {
            id: 92,
            name: "Supervisor",
            sortOrder: 1,
            requiredCertificationIds: [3],
          },
        ],
        organizationRoles: [{ id: 7, name: "Nurse", sortOrder: 3 }],
        certifications: [{ id: 3, name: "Supervisor", sortOrder: 0 }],
      },
    );

    const entries = await fetchMobileScheduleEntries(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      startDate: "2026-04-18",
      endDate: "2026-04-24",
    });

    expect(entries[0]?.employeeSeniority).toBe(4);
    expect(entries[0]?.presentation.segments).toEqual([
      expect.objectContaining({
        jobId: 91,
        jobName: "Nurse",
        jobSortOrder: 0,
      }),
      expect.objectContaining({
        jobId: 92,
        jobName: "Supervisor",
        jobSortOrder: 1,
      }),
    ]);
  });
});

describe("fetchMobileShiftRequests", () => {
  it("returns mobile request segments with job names and focus area labels", async () => {
    const serviceClient = createServiceClientForShiftRequests();

    const requests = await fetchMobileShiftRequests(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
    });

    expect(requests).toEqual([
      expect.objectContaining({
        id: "196d610f-2283-486c-a9e0-197852969a31",
        requesterName: "Sarah Jenkins",
        targetName: "Nic Kosmas",
        requesterPresentation: expect.objectContaining({
          segments: [
            expect.objectContaining({
              shiftId: 101,
              jobId: 91,
              label: "D",
              shiftName: "Day Shift",
              jobName: "Nurse",
              jobColor: "#EFF6FF",
              startTime: "07:15:00",
              endTime: "15:45:00",
              displayFocusAreaName: "Skilled Nursing",
            }),
          ],
        }),
        targetPresentation: expect.objectContaining({
          segments: [
            expect.objectContaining({
              shiftId: 102,
              jobId: 92,
              label: "E",
              shiftName: "Evening Shift",
              jobName: "Mentor",
              jobColor: "#EFF6FF",
              startTime: "15:30:00",
              endTime: "23:30:00",
              displayFocusAreaName: "Skilled Nursing",
              isMentored: true,
            }),
          ],
        }),
      }),
    ]);
  });

  it("includes open pickup requests when filtering for a linked employee", async () => {
    const serviceClient = createServiceClientForShiftRequests();

    await fetchMobileShiftRequests(serviceClient as never, {
      orgId: "b7c335a0-6218-4f4e-9a82-1d5f7c8e2b90",
      employeeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      includeOpenPickupRequests: true,
    });

    expect(serviceClient.requestsQuery.or).toHaveBeenCalledWith(
      "requester_emp_id.eq.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,target_emp_id.eq.bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb,and(status.eq.open,type.eq.pickup)",
    );
  });
});

describe("fetchMobileOpenShifts", () => {
  it("hides published coverage gaps that the linked employee is not qualified to cover", async () => {
    const serviceClient = createServiceClientForOpenShifts();

    const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
      orgId: "org-1",
      employee: {
        certificationId: null,
        focusAreaIds: [12],
        roleIds: [],
      } as never,
      startDate: "2026-04-16",
      endDate: "2026-04-16",
      timeZone: "America/Los_Angeles",
    });

    expect(openShifts).toEqual([]);
  });

  it("keeps manager-visible coverage gaps but marks them unavailable for the linked employee", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts();

      const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
        orgId: "org-1",
        employee: {
          id: "196d610f-2283-486c-a9e0-197852969a31",
          certificationId: null,
          focusAreaIds: [12],
          roleIds: [],
        } as never,
        showAll: true,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(openShifts).toHaveLength(1);
      expect(openShifts[0]).toMatchObject({
        id: expect.stringMatching(/^coverage_gap_12_.+_2026-04-16$/),
        canVolunteer: false,
        volunteerBlockReason: "You do not meet the eligibility requirements for this shift.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps coverage gaps visible to other employees until pending volunteers fill every needed slot", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts({
        minStaff: 2,
        shiftRequests: [createPendingOpenShiftVolunteerRow()],
      });

      const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
        orgId: "org-1",
        employee: {
          id: "another-employee",
          certificationId: null,
          focusAreaIds: [12],
          roleIds: [777],
        } as never,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(openShifts).toHaveLength(1);
      expect(openShifts[0]).toMatchObject({
        id: expect.stringMatching(/^coverage_gap_12_.+_2026-04-16$/),
        needed: 1,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not count pending volunteers from another focus area against a mobile open shift", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts({
        minStaff: 2,
        shiftRequests: [
          createPendingOpenShiftVolunteerRow({
            requester_state: {
              kind: "worked",
              focusAreaId: 99,
              segments: [
                {
                  shiftId: 101,
                  jobId: 91,
                  position: 0,
                  isMentored: false,
                },
              ],
              absenceTypeId: null,
              customStartTime: null,
              customEndTime: null,
              seriesId: null,
              fromRecurring: false,
            },
          }),
        ],
      });

      const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
        orgId: "org-1",
        employee: {
          id: "another-employee",
          certificationId: null,
          focusAreaIds: [12],
          roleIds: [777],
        } as never,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(openShifts).toHaveLength(1);
      expect(openShifts[0]).toMatchObject({
        id: expect.stringMatching(/^coverage_gap_12_.+_2026-04-16$/),
        needed: 2,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides coverage gaps from other employees once pending volunteers fill the remaining slots", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts({
        shiftRequests: [createPendingOpenShiftVolunteerRow()],
      });

      const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
        orgId: "org-1",
        employee: {
          id: "another-employee",
          certificationId: null,
          focusAreaIds: [12],
          roleIds: [777],
        } as never,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(openShifts).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides coverage gaps from the employee with their own pending volunteer request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts({
        minStaff: 2,
        shiftRequests: [createPendingOpenShiftVolunteerRow()],
      });

      const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
        orgId: "org-1",
        employee: {
          id: "196d610f-2283-486c-a9e0-197852969a31",
          certificationId: null,
          focusAreaIds: [12],
          roleIds: [777],
        } as never,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(openShifts).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides published coverage gaps once their resolved start time has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T15:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts();

      const openShifts = await fetchMobileOpenShifts(serviceClient as never, {
        orgId: "org-1",
        employee: {
          certificationId: null,
          focusAreaIds: [12],
          roleIds: [777],
        } as never,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(openShifts).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchMobileCoverageSummary", () => {
  // Regression test for the web-vs-mobile dashboard divergence: web's
  // dashboard counts an admin's unpublished DRAFT edits toward coverage
  // (apps/web/src/lib/schedule-cells.ts's `isScheduler ? (draft ?? published)
  // : published`), but mobile's coverage engine used to be strictly
  // published-only, so a gap filled only by a draft edit still showed as
  // open on mobile while web showed it filled. buildMobileCoverageEngineInputs
  // now fetches via fetchMobileEffectiveScheduleRows (draft-preferred),
  // matching web.
  it("counts a draft-only schedule cell (no published snapshot) toward coverage totals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const draftOnlyScheduleCell = {
        id: "cell-1",
        emp_id: "196d610f-2283-486c-a9e0-197852969a31",
        date: "2026-04-16",
        org_id: "org-1",
        focus_area_id: 12,
        version: 1,
        series_id: null,
        from_recurring: false,
        created_by: null,
        updated_by: null,
        created_at: null,
        updated_at: null,
        snapshots: [
          {
            id: "draft-snapshot",
            cell_id: "cell-1",
            org_id: "org-1",
            snapshot_kind: "draft",
            state_kind: "worked",
            absence_type_id: null,
            custom_start_time: null,
            custom_end_time: null,
            segments: [
              {
                id: "segment-0",
                snapshot_id: "draft-snapshot",
                org_id: "org-1",
                position: 0,
                shift_id: 101,
                job_id: 91,
                is_mentored: false,
              },
            ],
          },
        ],
        employees: {
          id: "196d610f-2283-486c-a9e0-197852969a31",
          first_name: "Nic",
          last_name: "Kosmas",
          org_id: "org-1",
        },
      };
      const serviceClient = createServiceClientForOpenShifts({
        scheduleCells: [draftOnlyScheduleCell],
      });

      const summary = await fetchMobileCoverageSummary(serviceClient as never, {
        orgId: "org-1",
        showAll: true,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(summary.totals).toEqual({ totalRequired: 1, totalFilled: 1, pct: 100, openSlots: 0 });
      expect(summary.openShifts).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the same slot as an open gap when there is no draft or published snapshot at all", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T18:00:00.000Z"));

    try {
      const serviceClient = createServiceClientForOpenShifts();

      const summary = await fetchMobileCoverageSummary(serviceClient as never, {
        orgId: "org-1",
        showAll: true,
        startDate: "2026-04-16",
        endDate: "2026-04-16",
        timeZone: "America/Los_Angeles",
      });

      expect(summary.totals).toEqual({ totalRequired: 1, totalFilled: 0, pct: 0, openSlots: 1 });
      expect(summary.openShifts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
