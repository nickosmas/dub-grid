import { describe, expect, it } from "vitest";
import {
  buildOperationsReportCsv,
  buildOperationsReportPdf,
  buildOperationsReportPayload,
  buildOperationsReportTable,
  resolveCurrentPayPeriodRange,
  type OperationsReportType,
  type OperationsReportSourceData,
} from "./operations";
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
        first_name: "Blake",
        last_name: "Diaz",
        employment_type: "part_time",
        email: "blake@example.com",
        phone: "",
        status: "benched",
        seniority: 2,
        focus_area_ids: [10],
        certification_id: null,
        role_ids: [],
        department_ids: [],
        user_id: null,
      },
    ],
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

    expect(payload.metrics).toEqual(
      expect.arrayContaining([
        { label: "Scheduled hours", value: "8" },
        { label: "Open slots", value: "1" },
        { label: "Unlinked staff", value: "1" },
      ]),
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
      resolutionHours: 2.5,
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
      "DAY Caregiver",
    );
  });

  it("resolves the current pay period from the organization anchor", () => {
    expect(
      resolveCurrentPayPeriodRange(
        "2026-04-19",
        new Date("2026-05-05T12:00:00.000Z"),
      ),
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
        "Absence days",
        "Overtime hours",
      ],
      rows: [
        ["Avery Ng", 8, 1, 1, 0, 0],
        ["Blake Diaz", 0, 0, 0, 1, 0],
      ],
    });
    expect(buildOperationsReportCsv(payload, "staff-hours")).toContain(
      "Employee,Scheduled hours,Shifts worked,Days worked,Absence days,Overtime hours\r\nAvery Ng,8,1,1,0,0",
    );
    const employeeDirectoryCsv = buildOperationsReportCsv(
      payload,
      "employee-directory",
    );
    expect(employeeDirectoryCsv).toContain(
      "Employee,Staff status,Employment type,Email,Phone,Focus areas,Roles,Certification\r\nAvery Ng,Active,Full-time,avery@example.com,555-0101,North,RN,CNA",
    );
    expect(employeeDirectoryCsv).not.toContain("full_time");
    expect(buildOperationsReportCsv(payload, "account-access")).toContain(
      "Blake Diaz,Benched,blake@example.com,Not linked,Pending invitation (blake@example.com),Invitation pending",
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
          "Employee",
          "Staff status",
          "Employment type",
          "Email",
          "Phone",
          "Focus areas",
          "Roles",
          "Certification",
        ],
        firstRow: [
          "Avery Ng",
          "Active",
          "Full-time",
          "avery@example.com",
          "555-0101",
          "North",
          "RN",
          "CNA",
        ],
      },
      {
        report: "staff-hours",
        headers: [
          "Employee",
          "Scheduled hours",
          "Shifts worked",
          "Days worked",
          "Absence days",
          "Overtime hours",
        ],
        firstRow: ["Avery Ng", 8, 1, 1, 0, 0],
      },
      {
        report: "coverage",
        headers: [
          "Date",
          "Focus area",
          "Shift",
          "Job",
          "Required",
          "Scheduled",
          "Open slots",
        ],
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
          "Requested by",
          "Requested with",
          "Shift date",
          "Time to resolution",
        ],
        firstRow: [
          "Call-off",
          "Approved",
          "Avery Ng",
          "No teammate",
          "May 3, 2026",
          "2.5 hours",
        ],
      },
      {
        report: "absences-calloffs",
        headers: ["Entry type", "Staff member", "Schedule date", "Absence type", "Status"],
        firstRow: ["Call-off", "Avery Ng", "May 3, 2026", "Sick", "Approved"],
      },
      {
        report: "roster-status",
        headers: [
          "Employee",
          "Staff status",
          "Employment type",
          "Focus areas",
          "Roles",
          "Account linked",
          "Invitation status",
        ],
        firstRow: [
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
          "Employee",
          "Staff status",
          "Email",
          "Account linked",
          "Invitation status",
          "Access status",
        ],
        firstRow: [
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
        firstRow: ["Avery Ng", "DAY Caregiver", ""],
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
    expect(text).toContain(
      "q 72.00 0 0 25.50 64.00 555.25 cm /Wordmark Do Q",
    );
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
    expect(text).toContain(pdfHex("Avery · No Ellipsis Through"));
    expect(text).toContain(pdfHex("Full Client Friendly Detail"));
    expect(text).not.toContain(pdfHex("..."));
    expect(text).toContain("0.945 0.945 0.945 rg");
    expect(text).toContain("%%EOF");
  });

  it("omits date ranges from snapshot PDF headers", () => {
    const payload = buildOperationsReportPayload(buildSource(), {
      startDate: "2026-05-03",
      endDate: "2026-05-04",
    });

    const text = new TextDecoder().decode(
      buildOperationsReportPdf(payload, "employee-directory"),
    );

    expect(text).toContain(pdfHex("Acme Health"));
    expect(text).toContain(pdfHex("Employee directory"));
    expect(text).toContain(pdfHex("Printed May 4, 2026"));
    expect(text).not.toContain(
      pdfHex("Employee directory - May 3, 2026 to May 4, 2026"),
    );
  });
});
