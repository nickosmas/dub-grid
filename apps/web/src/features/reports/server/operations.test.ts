import { describe, expect, it } from "vitest";
import {
  buildOperationsReportCsv,
  buildOperationsReportFilterOptions,
  buildOperationsReportPdf,
  buildOperationsReportPayload,
  buildOperationsReportTable,
  getDatesInReportRange,
  resolveCurrentPayPeriodRange,
  type OperationsReportType,
  type OperationsReportSourceData,
} from "./operations";
import { buildOperationsReportMetrics } from "@/features/reports/shared/table";
import { resolvePublishedScheduleEntry } from "@/lib/published-shifts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function pdfHex(value: string): string {
  return Buffer.from(value, "latin1").toString("hex");
}

function buildSource(
  overrides: Partial<OperationsReportSourceData> = {},
): OperationsReportSourceData {
  return {
    org: {
      id: ORG_ID,
      name: "Acme Health",
      timezone: "America/Los_Angeles",
      pay_period_start_date: "2026-04-19",
    },
    employees: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        employee_number: 1001,
        first_name: "Avery",
        last_name: "Ng",
        employment_type: "full_time",
        email: "avery@example.com",
        phone: "555-0101",
        status: "active",
        seniority: 1,
        focus_area_ids: [10],
        certification_id: 30,
        role_ids: [20],
        department_ids: [40],
        user_id: "user-1",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        employee_number: 1002,
        first_name: "Blake",
        last_name: "Diaz",
        employment_type: "part_time",
        email: "blake@example.com",
        phone: "",
        status: "inactive",
        seniority: 2,
        focus_area_ids: [10],
        certification_id: null,
        role_ids: [],
        department_ids: [],
        user_id: null,
      },
    ],
    historicalEmployees: [],
    focusAreas: [{ id: 10, name: "North" }],
    roles: [{ id: 20, name: "RN", abbr: "RN" }],
    certifications: [{ id: 30, name: "CNA", abbr: "CNA" }],
    departments: [{ id: 40, name: "Care", abbr: "CAR" }],
    absenceTypes: [{ id: 50, label: "Sick", name: "Sick" }],
    coverageRequirements: [
      {
        id: 1,
        focus_area_id: 10,
        job_id: 70,
        preferred_shift_id: 60,
        day_of_week: 0,
        min_staff: 2,
      },
    ],
    shiftCategories: [{ id: 60, name: "Day", focus_area_id: 10 }],
    jobs: [{ id: 70, name: "Caregiver" }],
    shiftRequests: [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        type: "calloff",
        status: "approved",
        requester_emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        target_emp_id: null,
        requester_shift_date: "2026-05-03",
        target_shift_date: null,
        absence_type_id: 50,
        created_at: "2026-05-02T10:00:00.000Z",
        resolved_at: "2026-05-02T12:30:00.000Z",
        updated_at: "2026-05-02T12:30:00.000Z",
      },
    ],
    invitations: [
      {
        employee_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        email: "blake@example.com",
        expires_at: "2026-05-20T00:00:00.000Z",
      },
    ],
    indicatorTypes: [
      { id: 80, name: "Late" },
      { id: 81, name: "Training" },
    ],
    scheduleNotes: [
      {
        emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        date: "2026-05-03",
        indicator_type_id: 80,
        focus_area_id: 10,
        status: "published",
      },
      {
        emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        date: "2026-05-03",
        indicator_type_id: 81,
        focus_area_id: 10,
        status: "published",
      },
      {
        emp_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        date: "2026-05-04",
        indicator_type_id: 80,
        focus_area_id: 10,
        status: "draft_deleted",
      },
      {
        emp_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        date: "2026-05-04",
        indicator_type_id: 81,
        focus_area_id: 10,
        status: "draft",
      },
    ],
    publishedRows: [
      {
        emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        date: "2026-05-03",
        focus_area_id: 10,
        published_absence_type_id: null,
        published_custom_start_time: null,
        published_custom_end_time: null,
        resolvedAssignmentIds: [],
        resolvedSegments: [
          {
            shiftId: 60,
            jobId: 70,
            label: "DAY Caregiver",
            isMentored: true,
            startTime: "07:00",
            endTime: "15:00",
          },
        ],
      },
      {
        emp_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        date: "2026-05-04",
        focus_area_id: 10,
        published_absence_type_id: 50,
        published_custom_start_time: null,
        published_custom_end_time: null,
        resolvedAssignmentIds: [],
      },
    ],
    generatedAt: "2026-05-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("operations reports", () => {
  it("resolves published segmented durations without counting gaps as worked hours", () => {
    const entry = resolvePublishedScheduleEntry(
      {
        emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        date: "2026-05-03",
        published_absence_type_id: null,
        published_custom_start_time: null,
        published_custom_end_time: null,
        resolvedAssignmentIds: [],
        resolvedSegments: [
          {
            shiftId: 60,
            jobId: 70,
            label: "DAY Caregiver",
            startTime: "07:00",
            endTime: "11:00",
            breakMinutes: 30,
          },
          {
            shiftId: 61,
            jobId: 71,
            label: "EVE Med Tech",
            startTime: "15:00",
            endTime: "19:00",
          },
          {
            shiftId: null,
            jobId: 72,
            label: "Meeting",
            startTime: null,
            endTime: null,
            durationHours: 1.5,
          },
        ],
      },
      new Map(),
    );

    expect(entry).toMatchObject({
      kind: "shift",
      durationHours: 9,
    });
  });

  it("computes staff, HR, coverage, request, absence, roster, and matrix reports", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(buildOperationsReportMetrics(payload, "shift-period-summary")).toEqual(
      expect.arrayContaining([
        { label: "Scheduled hours", value: "8" },
        { label: "Open slots", value: "1" },
      ]),
    );
    expect(buildOperationsReportMetrics(payload, "account-access")).toEqual(
      expect.arrayContaining([{ label: "Unlinked staff", value: "1" }]),
    );
    expect(payload.reports.employeeDirectory[0]).toMatchObject({
      employeeName: "Avery Ng",
      email: "avery@example.com",
      phone: "555-0101",
      roles: "RN",
      certification: "CNA",
    });
    expect(payload.reports.staffHours[0]).toMatchObject({
      employeeName: "Avery Ng",
      scheduledHours: 8,
      shiftCount: 1,
      absenceCount: 0,
      overtime: false,
    });
    expect(payload.reports.mentoringHours).toEqual([
      {
        employeeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        employeeName: "Avery Ng",
        mentoringHours: 8,
        mentoredAssignmentCount: 1,
        mentoredDays: 1,
      },
    ]);
    expect(payload.reports.mentoringDetail).toEqual([
      expect.objectContaining({
        employeeName: "Avery Ng",
        date: "2026-05-03",
        focusArea: "North",
        shift: "Day",
        job: "Caregiver",
        mentoringHours: 8,
      }),
    ]);
    expect(payload.reports.coverage[0]).toMatchObject({
      date: "2026-05-03",
      required: 2,
      scheduled: 1,
      openSlots: 1,
      coveragePct: 50,
    });
    expect(payload.reports.shiftRequests[0]).toMatchObject({
      type: "calloff",
      status: "approved",
      requester: "Avery Ng",
      absenceType: "Sick",
      resolutionHours: 2.5,
      decidedBy: "",
      managerNote: "",
    });
    expect(payload.reports.absencesCalloffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "absence",
          employeeName: "Blake Diaz",
          absenceType: "Sick",
        }),
        expect.objectContaining({
          kind: "calloff",
          employeeName: "Avery Ng",
          absenceType: "Sick",
        }),
      ]),
    );
    expect(payload.reports.rosterStatus[1]).toMatchObject({
      employeeName: "Blake Diaz",
      pendingInvitation: "blake@example.com",
      linkedAccount: false,
    });
    expect(payload.reports.certificationRoleMatrix[1]).toMatchObject({
      employeeName: "Blake Diaz",
      missingCertification: true,
      missingRole: true,
    });
    expect(payload.reports.accountAccess[1]).toMatchObject({
      employeeName: "Blake Diaz",
      accountAccessStatus: "Invitation pending",
    });
    expect(payload.reports.scheduleMatrix.rows[0].cells["2026-05-03"]).toBe(
      "DAY Caregiver / Late / Training",
    );
  });

  it("attributes removed employees in historical schedule reports without restoring them to the current roster", () => {
    const removedEmployee = {
      ...buildSource().employees[0],
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      employee_number: 1003,
      first_name: "Riley",
      last_name: "Stone",
      email: "riley@example.com",
      status: "removed",
      seniority: 3,
      user_id: null,
    };
    const payload = buildOperationsReportPayload(
      buildSource({
        historicalEmployees: [removedEmployee],
        publishedRows: [
          ...buildSource().publishedRows,
          {
            emp_id: removedEmployee.id,
            date: "2026-05-03",
            focus_area_id: 10,
            published_absence_type_id: null,
            published_custom_start_time: null,
            published_custom_end_time: null,
            resolvedAssignmentIds: [],
            resolvedSegments: [
              {
                shiftId: 60,
                jobId: 70,
                label: "DAY Caregiver",
                isMentored: true,
                startTime: "07:00",
                endTime: "15:00",
              },
            ],
          },
        ],
      }),
      { startDate: "2026-05-03", endDate: "2026-05-04" },
    );

    expect(payload.reports.staffHours).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeName: "Riley Stone", scheduledHours: 8 }),
      ]),
    );
    expect(payload.reports.scheduleMatrix.rows).toEqual(
      expect.arrayContaining([expect.objectContaining({ employeeName: "Riley Stone" })]),
    );
    expect(payload.reports.mentoringHours).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeName: "Riley Stone", mentoringHours: 8 }),
      ]),
    );
    expect(payload.reports.mentoringDetail).toEqual(
      expect.arrayContaining([expect.objectContaining({ employeeName: "Riley Stone" })]),
    );
    expect(payload.reports.coverage[0]).toMatchObject({ scheduled: 2, openSlots: 0 });

    expect(payload.filterOptions.employees.map((employee) => employee.label)).not.toContain(
      "Riley Stone",
    );
    expect(
      payload.reports.employeeDirectory.map((employee) => employee.employeeName),
    ).not.toContain("Riley Stone");
    expect(payload.reports.rosterStatus.map((employee) => employee.employeeName)).not.toContain(
      "Riley Stone",
    );
  });

  it("resolves the current pay period from the organization anchor", () => {
    expect(
      resolveCurrentPayPeriodRange("2026-04-19", new Date("2026-05-05T12:00:00.000Z")),
    ).toEqual({
      startDate: "2026-05-03",
      endDate: "2026-05-16",
    });
  });

  it("narrows reports to selected staff, focus areas, and individual dates", () => {
    const source = buildSource({
      focusAreas: [
        { id: 10, name: "North" },
        { id: 11, name: "South" },
      ],
      employees: buildSource().employees.map((employee) =>
        employee.id === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
          ? { ...employee, focus_area_ids: [11] }
          : employee,
      ),
    });

    const payload = buildOperationsReportPayload(
      source,
      {
        startDate: "2026-05-03",
        endDate: "2026-05-04",
      },
      {
        employeeIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        focusAreaIds: [10],
        dates: ["2026-05-03"],
      },
    );

    expect(payload.filters).toEqual({
      employeeIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      focusAreaIds: [10],
      shiftCategoryIds: [],
      jobIds: [],
      indicatorTypeIds: [],
      dates: ["2026-05-03"],
    });
    expect(payload.filterOptions.focusAreas).toEqual([
      { id: "10", label: "North" },
      { id: "11", label: "South" },
    ]);
    expect(payload.reports.staffHours).toHaveLength(1);
    expect(payload.reports.staffHours[0]).toMatchObject({
      employeeName: "Avery Ng",
      scheduledHours: 8,
    });
    expect(payload.reports.scheduleMatrix.dates).toEqual(["2026-05-03"]);
    expect(payload.reports.coverage).toHaveLength(1);
    expect(payload.reports.absencesCalloffs).toEqual([
      expect.objectContaining({ kind: "calloff", employeeName: "Avery Ng" }),
    ]);
  });

  it("reports when a call-off was made and how much notice it gave, in the org's time zone", () => {
    const source = buildSource({
      shiftCategories: [
        { id: 60, name: "Day", focus_area_id: 10, start_time: "07:00:00", end_time: "15:30:00" },
      ],
      shiftRequests: [
        {
          ...buildSource().shiftRequests[0],
          // 7:00 AM Pacific on May 3 is 14:00 UTC; submitted 20 hours before.
          created_at: "2026-05-02T18:00:00.000Z",
          resolved_at: "2026-05-02T19:00:00.000Z",
          admin_note: "Feel better",
          requester_state: {
            kind: "worked",
            segments: [{ shiftId: 60, jobId: 70, position: 0 }],
            absenceTypeId: 50,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
        },
      ],
    });
    const payload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-09",
    });

    expect(payload.reports.absencesCalloffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "calloff",
          employeeName: "Avery Ng",
          droppedShift: "Day",
          droppedShiftTime: "7:00 AM - 3:30 PM",
          submittedAt: "2026-05-02T18:00:00.000Z",
          noticeHours: 20,
          decidedAt: "2026-05-02T19:00:00.000Z",
          managerNote: "Feel better",
        }),
      ]),
    );
    const table = buildOperationsReportTable(payload, "absences-calloffs");
    const calloffRow = table.rows.find((row) => row[0] === "Call-off")!;
    expect(calloffRow.slice(5)).toEqual([
      "Day",
      "7:00 AM - 3:30 PM",
      "May 2, 2026, 6:00 PM UTC",
      "20 hours before",
      "May 2, 2026, 7:00 PM UTC",
      "-",
      "Feel better",
    ]);
  });

  it("builds staff activity from published cells and request snapshots", () => {
    const source = buildSource({
      shiftCategories: [
        { id: 60, name: "Day", focus_area_id: 10, start_time: "07:00:00", end_time: "15:30:00" },
        { id: 61, name: "Night", focus_area_id: 10, start_time: "23:00:00", end_time: "07:00:00" },
      ],
      publishedRows: [
        {
          ...buildSource().publishedRows[0],
          resolvedSegments: [
            {
              shiftId: 60,
              jobId: 70,
              label: "DAY Caregiver",
              startTime: "07:00",
              endTime: "15:00",
            },
            {
              shiftId: 61,
              jobId: 70,
              label: "NIGHT Caregiver",
              startTime: "15:00",
              endTime: "23:00",
            },
          ],
        },
      ],
      shiftRequests: [
        {
          ...buildSource().shiftRequests[0],
          type: "swap",
          status: "approved",
          target_emp_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          target_shift_date: "2026-05-04",
          requester_state: {
            kind: "worked",
            segments: [{ shiftId: 60, jobId: 70, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
          target_state: {
            kind: "worked",
            segments: [{ shiftId: 61, jobId: 70, position: 0 }],
            absenceTypeId: null,
            customStartTime: null,
            customEndTime: null,
            seriesId: null,
            fromRecurring: false,
          },
        },
      ],
    });

    const payload = buildOperationsReportPayload(
      source,
      { startDate: "2026-05-03", endDate: "2026-05-04" },
      { employeeIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"], shiftCategoryIds: [60] },
    );

    // The request row carries both sides of the swap as the card shows them.
    expect(payload.reports.shiftRequests[0]).toMatchObject({
      type: "swap",
      requester: "Avery Ng",
      requesterShift: "Day",
      requesterJobs: "Caregiver",
      requesterFocusArea: "North",
      requesterTime: "7:00 AM - 3:30 PM",
      target: "Blake Diaz",
      targetShiftDate: "2026-05-04",
      targetShift: "Night",
      targetTime: "11:00 PM - 7:00 AM",
    });
    expect(payload.reports.staffHours[0]).toMatchObject({
      scheduledHours: 8,
      shiftBreakdown: "Day (1, 8h)",
      jobBreakdown: "Caregiver (1, 8h)",
    });
    expect(payload.reports.staffActivity.summaries[0]).toMatchObject({
      employeeName: "Avery Ng",
      publishedAbsenceDays: 0,
      unscheduledDays: 1,
      approvedImpactCount: 1,
      allRequestCount: 1,
      initiatedRequestCount: 1,
      receivedRequestCount: 0,
    });
    expect(payload.reports.staffActivity.events).toEqual([
      expect.objectContaining({
        employeeName: "Avery Ng",
        requestType: "swap",
        participation: "initiated",
        shiftCategories: "Day",
      }),
    ]);
  });

  it("labels valid shiftless assignments as General shift", () => {
    const source = buildSource({
      publishedRows: [
        {
          ...buildSource().publishedRows[0],
          resolvedSegments: [
            {
              shiftId: null,
              jobId: 70,
              label: "Office",
              startTime: "08:00",
              endTime: "12:00",
            },
          ],
        },
      ],
    });

    const payload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-03",
    });

    expect(payload.reports.staffHours[0]).toMatchObject({
      shiftBreakdown: "General shift (1, 4h)",
      jobBreakdown: "Caregiver (1, 4h)",
    });
  });

  it("intersects selected shift categories and jobs for one employee", () => {
    const source = buildSource({
      jobs: [
        { id: 70, name: "Caregiver" },
        { id: 71, name: "Supervisor" },
      ],
      publishedRows: [
        {
          ...buildSource().publishedRows[0],
          resolvedSegments: [
            {
              shiftId: 60,
              jobId: 70,
              label: "DAY Caregiver",
              startTime: "07:00",
              endTime: "11:00",
            },
            {
              shiftId: 60,
              jobId: 71,
              label: "DAY Supervisor",
              startTime: "11:00",
              endTime: "15:00",
            },
          ],
        },
      ],
    });

    const payload = buildOperationsReportPayload(
      source,
      { startDate: "2026-05-03", endDate: "2026-05-03" },
      {
        employeeIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        shiftCategoryIds: [60],
        jobIds: [71],
      },
    );

    expect(payload.reports.staffHours).toEqual([
      expect.objectContaining({
        employeeName: "Avery Ng",
        scheduledHours: 4,
        shiftBreakdown: "Day (1, 4h)",
        jobBreakdown: "Supervisor (1, 4h)",
      }),
    ]);
  });

  it("counts only published mentored segments with their own duration and focus area", () => {
    const source = buildSource({
      employees: [{ ...buildSource().employees[0], focus_area_ids: [10, 11] }],
      focusAreas: [
        { id: 10, name: "North" },
        { id: 11, name: "South" },
      ],
      shiftCategories: [
        { id: 60, name: "Day", focus_area_id: 10 },
        { id: 61, name: "Evening", focus_area_id: 11 },
      ],
      publishedRows: [
        {
          ...buildSource().publishedRows[0],
          resolvedSegments: [
            {
              shiftId: 60,
              jobId: 70,
              label: "DAY Caregiver",
              isMentored: true,
              startTime: "07:00",
              endTime: "15:00",
              breakMinutes: 30,
            },
            {
              shiftId: 61,
              jobId: 70,
              label: "EVE Caregiver",
              isMentored: false,
              startTime: "15:00",
              endTime: "23:00",
            },
            {
              shiftId: null,
              jobId: 70,
              label: "Mentoring meeting",
              isMentored: true,
              startTime: null,
              endTime: null,
              durationHours: 1.5,
            },
          ],
        },
        {
          ...buildSource().publishedRows[0],
          date: "2026-05-04",
          resolvedSegments: [
            {
              shiftId: 60,
              jobId: 70,
              label: "DAY Caregiver",
              isMentored: true,
              startTime: "23:00",
              endTime: "03:00",
            },
          ],
        },
      ],
    });

    const payload = buildOperationsReportPayload(
      source,
      { startDate: "2026-05-03", endDate: "2026-05-04" },
      { focusAreaIds: [10], dates: ["2026-05-04"] },
    );

    expect(payload.reports.mentoringHours).toEqual([
      expect.objectContaining({
        employeeName: "Avery Ng",
        mentoringHours: 4,
        mentoredAssignmentCount: 1,
        mentoredDays: 1,
      }),
    ]);
    expect(payload.reports.mentoringDetail).toEqual([
      expect.objectContaining({
        date: "2026-05-04",
        focusArea: "North",
        mentoringHours: 4,
      }),
    ]);

    const fullRangePayload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });
    expect(fullRangePayload.reports.mentoringHours[0]).toMatchObject({
      mentoringHours: 13,
      mentoredAssignmentCount: 3,
      mentoredDays: 2,
    });
  });

  it("keeps management-only staff (no focus area) in roster reports but not schedule reports, even with a focus area filter", () => {
    const source = buildSource({
      departments: [
        { id: 40, name: "Care", abbr: "CAR" },
        { id: 41, name: "HR", abbr: "HR" },
      ],
      employees: [
        ...buildSource().employees,
        {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          employee_number: 1003,
          first_name: "Casey",
          last_name: "Lee",
          employment_type: "full_time",
          email: "casey@example.com",
          phone: "555-0103",
          status: "active",
          seniority: 3,
          focus_area_ids: [],
          certification_id: null,
          role_ids: [],
          department_ids: [41],
          user_id: null,
        },
      ],
    });

    const payload = buildOperationsReportPayload(
      source,
      { startDate: "2026-05-03", endDate: "2026-05-04" },
      { focusAreaIds: [10] },
    );

    expect(payload.reports.employeeDirectory.map((row) => row.employeeName)).toContain("Casey Lee");
    expect(payload.reports.rosterStatus.map((row) => row.employeeName)).toContain("Casey Lee");
    expect(payload.reports.certificationRoleMatrix.map((row) => row.employeeName)).toContain(
      "Casey Lee",
    );
    expect(payload.reports.accountAccess.map((row) => row.employeeName)).toContain("Casey Lee");
    expect(payload.reports.staffHours.map((row) => row.employeeName)).not.toContain("Casey Lee");
    expect(payload.reports.scheduleMatrix.rows.map((row) => row.employeeName)).not.toContain(
      "Casey Lee",
    );

    const directoryRow = payload.reports.employeeDirectory.find(
      (row) => row.employeeName === "Casey Lee",
    );
    expect(directoryRow).toMatchObject({
      employeeNumber: 1003,
      departments: "HR",
      focusAreas: "",
    });
  });

  it("resolves a scheduled department from the employee's focus area, not just department_ids", () => {
    const source = buildSource({
      focusAreas: [{ id: 10, name: "North", department_id: 41 }],
      departments: [
        { id: 40, name: "Care", abbr: "CAR" },
        { id: 41, name: "Nursing", abbr: "NUR" },
      ],
      employees: buildSource().employees.map((employee) =>
        employee.id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          ? { ...employee, department_ids: [] }
          : employee,
      ),
    });

    const payload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(payload.reports.employeeDirectory[0]).toMatchObject({
      employeeName: "Avery Ng",
      departments: "Nursing",
    });
    expect(payload.reports.rosterStatus[0]).toMatchObject({
      employeeName: "Avery Ng",
      departments: "Nursing",
    });
    expect(payload.reports.certificationRoleMatrix[0]).toMatchObject({
      employeeName: "Avery Ng",
      departments: "Nursing",
    });
  });

  it("shows the scheduled department, not a department-admin grant, when an employee has both", () => {
    const source = buildSource({
      focusAreas: [{ id: 10, name: "North", department_id: 41 }],
      departments: [
        { id: 40, name: "Care", abbr: "CAR" },
        { id: 41, name: "Nursing", abbr: "NUR" },
      ],
      // employees[0] already has department_ids: [40] ("Care" — a department-admin
      // permission grant unrelated to where they work) and focus_area_ids: [10]
      // (scheduled "Nursing" via the focus area above, where they actually work).
    });

    const payload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(payload.reports.employeeDirectory[0]).toMatchObject({
      employeeName: "Avery Ng",
      departments: "Nursing",
    });
    expect(payload.reports.rosterStatus[0]).toMatchObject({
      employeeName: "Avery Ng",
      departments: "Nursing",
    });
    expect(payload.reports.certificationRoleMatrix[0]).toMatchObject({
      employeeName: "Avery Ng",
      departments: "Nursing",
    });
  });

  it("computes segmented hours and coverage from matching schedule segments", () => {
    const source = buildSource({
      focusAreas: [
        { id: 10, name: "North" },
        { id: 11, name: "South" },
      ],
      employees: [
        {
          ...buildSource().employees[0],
          focus_area_ids: [10, 11],
        },
      ],
      shiftCategories: [
        { id: 60, name: "Day", focus_area_id: 10 },
        { id: 61, name: "Evening", focus_area_id: 11 },
      ],
      jobs: [
        { id: 70, name: "Caregiver" },
        { id: 71, name: "Med Tech" },
        { id: 72, name: "Meeting" },
      ],
      coverageRequirements: [
        {
          id: 2,
          focus_area_id: 11,
          job_id: 71,
          preferred_shift_id: 61,
          day_of_week: 0,
          min_staff: 1,
        },
      ],
      shiftRequests: [],
      publishedRows: [
        {
          emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          date: "2026-05-03",
          focus_area_id: 10,
          published_absence_type_id: null,
          published_custom_start_time: null,
          published_custom_end_time: null,
          resolvedAssignmentIds: [],
          resolvedSegments: [
            {
              shiftId: 60,
              jobId: 70,
              label: "DAY Caregiver",
              startTime: "07:00",
              endTime: "11:00",
              durationHours: 4,
            },
            {
              shiftId: 61,
              jobId: 71,
              label: "EVE Med Tech",
              startTime: "15:00",
              endTime: "19:00",
              durationHours: 4,
            },
            {
              shiftId: null,
              jobId: 72,
              label: "Meeting",
              startTime: null,
              endTime: null,
              durationHours: 1.5,
            },
          ],
        },
      ],
    });

    const fullPayload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-03",
    });
    expect(fullPayload.reports.staffHours[0]).toMatchObject({
      scheduledHours: 9.5,
      shiftCount: 1,
    });
    expect(fullPayload.reports.shiftPeriodSummary).toMatchObject({
      totalScheduledHours: 9.5,
      totalShifts: 1,
    });
    expect(fullPayload.reports.coverage[0]).toMatchObject({
      focusArea: "South",
      scheduled: 1,
      openSlots: 0,
      coveragePct: 100,
    });

    const northPayload = buildOperationsReportPayload(
      source,
      {
        startDate: "2026-05-03",
        endDate: "2026-05-03",
      },
      { focusAreaIds: [10] },
    );
    expect(northPayload.reports.staffHours[0]).toMatchObject({
      scheduledHours: 5.5,
      shiftCount: 1,
    });
    expect(northPayload.reports.coverage).toHaveLength(0);

    const southPayload = buildOperationsReportPayload(
      source,
      {
        startDate: "2026-05-03",
        endDate: "2026-05-03",
      },
      { focusAreaIds: [11] },
    );
    expect(southPayload.reports.staffHours[0]).toMatchObject({
      scheduledHours: 4,
      shiftCount: 1,
    });
    expect(southPayload.reports.coverage[0]).toMatchObject({
      scheduled: 1,
      openSlots: 0,
    });
  });

  it("exports the selected report as escaped CSV", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(buildOperationsReportTable(payload, "staff-hours")).toMatchObject({
      headers: [
        "Employee",
        "Scheduled hours",
        "Shifts worked",
        "Days worked",
        "Shift breakdown",
        "Job breakdown",
        "Shift notes",
        "Absence days",
        "Overtime hours",
      ],
      rows: [
        ["Avery Ng", 8, 1, 1, "Day (1, 8h)", "Caregiver (1, 8h)", "Late (1); Training (1)", 0, 0],
        ["Blake Diaz", 0, 0, 0, "No categorized shifts", "No jobs", "Late (1)", 1, 0],
      ],
    });
    expect(buildOperationsReportCsv(payload, "staff-hours")).toContain(
      'Employee,Scheduled hours,Shifts worked,Days worked,Shift breakdown,Job breakdown,Shift notes,Absence days,Overtime hours\r\nAvery Ng,8,1,1,"Day (1, 8h)","Caregiver (1, 8h)",Late (1); Training (1),0,0',
    );
    const employeeDirectoryCsv = buildOperationsReportCsv(payload, "employee-directory");
    expect(employeeDirectoryCsv).toContain(
      "Employee ID,Employee,Staff status,Employment type,Email,Phone,Focus areas,Roles,Certification,Departments\r\n#1001,Avery Ng,Active,Full-time,avery@example.com,555-0101,North,RN,CNA,Care",
    );
    expect(employeeDirectoryCsv).not.toContain("full_time");
    expect(buildOperationsReportCsv(payload, "account-access")).toContain(
      "#1002,Blake Diaz,Inactive,blake@example.com,Not linked,Pending invitation (blake@example.com),Invitation pending",
    );
    expect(buildOperationsReportCsv(payload, "schedule-matrix")).toContain(
      'Employee,"May 3, 2026","May 4, 2026"',
    );
  });

  it("builds every export table from the preview column and row shape", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });
    const expectations: Array<{
      report: OperationsReportType;
      headers: string[];
      firstRow: Array<string | number | boolean | null | undefined>;
    }> = [
      {
        report: "employee-directory",
        headers: [
          "Employee ID",
          "Employee",
          "Staff status",
          "Employment type",
          "Email",
          "Phone",
          "Focus areas",
          "Roles",
          "Certification",
          "Departments",
        ],
        firstRow: [
          "#1001",
          "Avery Ng",
          "Active",
          "Full-time",
          "avery@example.com",
          "555-0101",
          "North",
          "RN",
          "CNA",
          "Care",
        ],
      },
      {
        report: "staff-hours",
        headers: [
          "Employee",
          "Scheduled hours",
          "Shifts worked",
          "Days worked",
          "Shift breakdown",
          "Job breakdown",
          "Shift notes",
          "Absence days",
          "Overtime hours",
        ],
        firstRow: [
          "Avery Ng",
          8,
          1,
          1,
          "Day (1, 8h)",
          "Caregiver (1, 8h)",
          "Late (1); Training (1)",
          0,
          0,
        ],
      },
      {
        report: "staff-activity",
        headers: [
          "Staff member",
          "Scheduled hours",
          "Shift assignments",
          "Work days",
          "Shift breakdown",
          "Job breakdown",
          "Shift notes",
          "Published off days",
          "Unscheduled days",
          "Approved impact",
          "All request activity",
          "Request breakdown",
        ],
        firstRow: [
          "Avery Ng",
          8,
          1,
          1,
          "Day (1, 8h)",
          "Caregiver (1, 8h)",
          "Late (1); Training (1)",
          0,
          1,
          1,
          1,
          "Initiated calloff (approved) (1)",
        ],
      },
      {
        report: "mentoring-hours",
        headers: ["Staff member", "Mentoring hours", "Mentored assignments", "Mentored days"],
        firstRow: ["Avery Ng", 8, 1, 1],
      },
      {
        report: "mentoring-detail",
        headers: [
          "Staff member",
          "Date",
          "Focus area",
          "Shift",
          "Job",
          "Start time",
          "End time",
          "Mentoring hours",
        ],
        firstRow: ["Avery Ng", "May 3, 2026", "North", "Day", "Caregiver", "07:00", "15:00", 8],
      },
      {
        report: "coverage",
        headers: ["Date", "Focus area", "Shift", "Job", "Required", "Scheduled", "Open slots"],
        firstRow: ["May 3, 2026", "North", "Day", "Caregiver", 2, 1, 1],
      },
      {
        report: "shift-period-summary",
        headers: ["Metric", "Value"],
        firstRow: ["Scheduled hours", 8],
      },
      {
        report: "shift-requests",
        headers: [
          "Request type",
          "Request status",
          "Requester",
          "Requester's shift date",
          "Requester's shift",
          "Requester's job",
          "Requester's focus area",
          "Requester's time",
          "Teammate",
          "Teammate's shift date",
          "Teammate's shift",
          "Teammate's job",
          "Teammate's focus area",
          "Teammate's time",
          "Absence type",
          "Submitted",
          "Decided",
          "Decided by",
          "Time to resolution",
          "Manager note",
        ],
        firstRow: [
          "Call-off",
          "Approved",
          "Avery Ng",
          "May 3, 2026",
          "-",
          "-",
          "-",
          "-",
          "No teammate",
          "-",
          "-",
          "-",
          "-",
          "-",
          "Sick",
          "May 2, 2026, 10:00 AM UTC",
          "May 2, 2026, 12:30 PM UTC",
          "-",
          "2.5 hours",
          "-",
        ],
      },
      {
        report: "absences-calloffs",
        headers: [
          "Entry type",
          "Staff member",
          "Schedule date",
          "Absence type",
          "Status",
          "Dropped shift",
          "Shift time",
          "Called off at",
          "Notice given",
          "Decided",
          "Decided by",
          "Manager note",
        ],
        // The fixture's call-off carries no shift snapshot, so the shift and
        // notice columns are blank; the timing test below covers them.
        firstRow: [
          "Call-off",
          "Avery Ng",
          "May 3, 2026",
          "Sick",
          "Approved",
          "-",
          "-",
          "May 2, 2026, 10:00 AM UTC",
          "-",
          "May 2, 2026, 12:30 PM UTC",
          "-",
          "-",
        ],
      },
      {
        report: "roster-status",
        headers: [
          "Employee ID",
          "Employee",
          "Staff status",
          "Employment type",
          "Focus areas",
          "Roles",
          "Account linked",
          "Invitation status",
        ],
        firstRow: [
          "#1001",
          "Avery Ng",
          "Active",
          "Full-time",
          "North",
          "RN",
          "Linked",
          "No pending invitation",
        ],
      },
      {
        report: "certification-role-matrix",
        headers: [
          "Employee ID",
          "Employee",
          "Staff status",
          "Certification",
          "Roles",
          "Focus areas",
          "Departments",
          "Certification status",
          "Role status",
        ],
        firstRow: [
          "#1001",
          "Avery Ng",
          "Active",
          "CNA",
          "RN",
          "North",
          "Care",
          "Certification recorded",
          "Role assigned",
        ],
      },
      {
        report: "account-access",
        headers: [
          "Employee ID",
          "Employee",
          "Staff status",
          "Email",
          "Account linked",
          "Invitation status",
          "Access status",
        ],
        firstRow: [
          "#1001",
          "Avery Ng",
          "Active",
          "avery@example.com",
          "Linked",
          "No pending invitation",
          "Linked",
        ],
      },
      {
        report: "schedule-matrix",
        headers: ["Employee", "May 3, 2026", "May 4, 2026"],
        firstRow: ["Avery Ng", "DAY Caregiver / Late / Training", ""],
      },
      {
        report: "shift-notes",
        headers: ["Date", "Employee", "Indicator", "Focus area"],
        firstRow: ["May 3, 2026", "Avery Ng", "Late", "North"],
      },
    ];

    for (const expectation of expectations) {
      const table = buildOperationsReportTable(payload, expectation.report);
      expect(table.headers).toEqual(expectation.headers);
      expect(table.rows[0]).toEqual(expectation.firstRow);
      expect(table.rows[0]).toHaveLength(table.headers.length);
    }
  });

  it("exports the selected report as a PDF document", () => {
    const source = buildSource();
    source.employees[0] = {
      ...source.employees[0],
      first_name: "Avery ·",
      last_name: "No Ellipsis Through December Reporting Review With Full Client Friendly Detail",
    };
    const payload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    const pdf = buildOperationsReportPdf(payload, "staff-hours");
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Subtype /Image");
    expect(text).toContain("q 24.00 0 0 24.00 32.00 556.00 cm /Logo Do Q");
    expect(text).toContain("q 72.00 0 0 25.50 64.00 555.25 cm /Wordmark Do Q");
    expect(text).toContain("q 0.059 0.090 0.141 rg 32.00 532.00 728.00 1.40 re f Q");
    expect(text).not.toContain(`/F2 18 Tf 1 0 0 1 64.00 563.00 Tm <${pdfHex("dubgrid")}> Tj`);
    expect(text).toContain("q 0.580 0.639 0.722 rg 141.80 560.00 0.80 16.00 re f Q");
    expect(text).not.toContain(`Tm <${pdfHex("|")}> Tj`);
    expect(text).toContain(`/F1 11 Tf 1 0 0 1 148.40 564.15 Tm <${pdfHex("Acme Health")}> Tj`);
    expect(text).toContain(pdfHex("Acme Health"));
    expect(text).toContain(pdfHex("Staff hours - May 3, 2026 to May 4, 2026"));
    expect(text).toContain(pdfHex("Printed May 4, 2026"));
    expect(text.indexOf(pdfHex("Staff hours - May 3, 2026 to May 4, 2026"))).toBeLessThan(
      text.indexOf("q 0.059 0.090 0.141 rg 32.00 532.00 728.00 1.40 re f Q"),
    );
    expect(text).not.toContain(pdfHex("Generated"));
    expect(text).toContain(pdfHex("Scheduled hours: 8 | Shifts: 1 | Overtime alerts: 0"));
    expect(text).not.toContain(pdfHex("Coverage:"));
    expect(text).not.toContain(pdfHex("Requests:"));
    expect(text).not.toContain(pdfHex("Avery ? Ng"));
    expect(text).toContain(pdfHex("Avery · No Ellipsis Through December"));
    expect(text).toContain(pdfHex("Friendly Detail"));
    expect(text).not.toContain(pdfHex("..."));
    expect(text).toContain("0.945 0.945 0.945 rg");
    expect(text).toContain("%%EOF");
  });

  it("omits date ranges from snapshot PDF headers", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    const text = new TextDecoder().decode(buildOperationsReportPdf(payload, "employee-directory"));

    expect(text).toContain(pdfHex("Acme Health"));
    expect(text).toContain(pdfHex("Employee directory"));
    expect(text).toContain(pdfHex("Printed May 4, 2026"));
    expect(text).not.toContain(pdfHex("Employee directory - May 3, 2026 to May 4, 2026"));
  });

  it("reports published shift notes and leaves unpublished drafts out", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(payload.reports.shiftNotes).toEqual([
      {
        employeeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        employeeName: "Avery Ng",
        date: "2026-05-03",
        indicator: "Late",
        focusArea: "North",
      },
      {
        employeeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        employeeName: "Avery Ng",
        date: "2026-05-03",
        indicator: "Training",
        focusArea: "North",
      },
      {
        employeeId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        employeeName: "Blake Diaz",
        date: "2026-05-04",
        indicator: "Late",
        focusArea: "North",
      },
    ]);
  });

  it("narrows shift notes to the selected indicators", () => {
    const payload = buildOperationsReportPayload(
      buildSource(),
      { startDate: "2026-05-03", endDate: "2026-05-04" },
      { indicatorTypeIds: [81] },
    );

    expect(payload.reports.shiftNotes.map((row) => row.indicator)).toEqual(["Training"]);
    expect(payload.filters.indicatorTypeIds).toEqual([81]);
  });

  it("summarizes shift notes per employee on staff hours and activity", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    const avery = payload.reports.staffHours.find((row) => row.employeeName === "Avery Ng")!;
    expect(avery.indicatorBreakdown).toBe("Late (1); Training (1)");

    const averyActivity = payload.reports.staffActivity.summaries.find(
      (row) => row.employeeName === "Avery Ng",
    )!;
    expect(averyActivity.indicatorBreakdown).toBe("Late (1); Training (1)");
  });

  it("keeps a note-only employee out of staff hours but in the shift notes report", () => {
    // A note outlives the shift it was written against: schedule_notes has no
    // foreign key to the cell, so deleting a shift leaves its notes behind.
    // Staff hours stays a report about worked time; the orphan surfaces here.
    const source = buildSource({
      publishedRows: [],
      scheduleNotes: [
        {
          emp_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          date: "2026-05-03",
          indicator_type_id: 80,
          focus_area_id: 10,
          status: "published",
        },
      ],
    });
    const payload = buildOperationsReportPayload(source, {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(buildOperationsReportTable(payload, "staff-hours").rows).toEqual([]);
    expect(buildOperationsReportTable(payload, "shift-notes").rows).toEqual([
      ["May 3, 2026", "Avery Ng", "Late", "North"],
    ]);
  });

  it("adds shift notes to their schedule matrix cell after the shift label", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    const avery = payload.reports.scheduleMatrix.rows.find(
      (row) => row.employeeName === "Avery Ng",
    )!;

    expect(avery.cells["2026-05-03"]).toBe("DAY Caregiver / Late / Training");
  });

  it("exports the shift notes report as CSV", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    const csv = buildOperationsReportCsv(payload, "shift-notes");

    expect(csv.split("\r\n")[0]).toBe("Date,Employee,Indicator,Focus area");
    expect(csv).toContain('"May 3, 2026",Avery Ng,Late,North');
    expect(csv).toContain('"May 4, 2026",Blake Diaz,Late,North');
    expect(csv.split("\r\n")).toHaveLength(4);
  });

  it("counts shift note metrics", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    expect(buildOperationsReportMetrics(payload, "shift-notes")).toEqual([
      { label: "Shift notes", value: "3" },
      { label: "Staff tagged", value: "2" },
      { label: "Indicators used", value: "2" },
    ]);
  });
});

describe("buildOperationsReportFilterOptions", () => {
  // The options-only loader (build plan item 30) builds the dropdown lists
  // from this function alone, so it must be exactly what the full payload
  // carries: same rows in, same options out.
  it("matches the filter options the full payload carries", () => {
    const source = buildSource();
    const range = { startDate: "2026-06-01", endDate: "2026-06-07" };

    const full = buildOperationsReportPayload(source, range, {
      employeeIds: [source.employees[0]!.id],
      jobIds: [source.jobs[0]!.id],
    });
    const optionsOnly = buildOperationsReportFilterOptions(source, getDatesInReportRange(range));

    expect(optionsOnly).toEqual(full.filterOptions);
    // Range-scoped, never filter-scoped: the applied employee/job filters
    // above did not shrink what is offered for the next report.
    expect(optionsOnly.employees.length).toBe(source.employees.length);
    expect(optionsOnly.jobs.length).toBe(source.jobs.length);
    expect(optionsOnly.dates).toHaveLength(7);
  });
});
