import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermissions = vi.fn();
const loadOperationsReport = vi.fn();
const buildOperationsReportCsv = vi.fn();
const buildOperationsReportPdf = vi.fn();
const auditInsert = vi.fn();

vi.mock("@/app/api/shared/permissions", () => ({
  requireOrgPermissions: (...args: unknown[]) => requireOrgPermissions(...args),
}));

vi.mock("@/lib/logger", () => ({
  default: { error: vi.fn() },
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/features/reports/server/operations", async () => {
  const actual = await vi.importActual<typeof import("@/features/reports/server/operations")>(
    "@/features/reports/server/operations",
  );
  return {
    ...actual,
    loadOperationsReport: (...args: unknown[]) => loadOperationsReport(...args),
    buildOperationsReportCsv: (...args: unknown[]) =>
      buildOperationsReportCsv(...args),
    buildOperationsReportPdf: (...args: unknown[]) =>
      buildOperationsReportPdf(...args),
  };
});

import { GET as GET_REPORT } from "./route";
import { GET as GET_EXPORT } from "./export/route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function makeReportRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/reports/operations?${query || `orgId=${ORG_ID}&startDate=2026-05-03&endDate=2026-05-09`}`,
  );
}

function makeExportRequest(query = "") {
  return new NextRequest(
    `http://localhost/api/reports/operations/export?${
      query ||
      `orgId=${ORG_ID}&startDate=2026-05-03&endDate=2026-05-09&report=staff-hours`
    }`,
  );
}

describe("reports operations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditInsert.mockResolvedValue({ error: null });
    requireOrgPermissions.mockResolvedValue({
      actor: { id: "user-1", email: "owner@example.com" },
      permissions: { role: "admin", isSuperAdmin: false },
      serviceClient: {
        from: vi.fn((table: string) => {
          if (table === "audit_log") {
            return { insert: auditInsert };
          }
          throw new Error(`Unexpected table ${table}`);
        }),
      },
    });
    loadOperationsReport.mockResolvedValue({
      orgId: ORG_ID,
      orgName: "Acme",
      orgTimezone: "America/Los_Angeles",
      generatedAt: "2026-05-05T00:00:00.000Z",
      range: { startDate: "2026-05-03", endDate: "2026-05-09" },
      payPeriodStartDate: null,
      filters: { employeeIds: [], focusAreaIds: [], dates: [] },
      filterOptions: { employees: [], focusAreas: [], dates: [] },
      metrics: [],
      reports: {
        employeeDirectory: [],
        staffHours: [],
        coverage: [],
        shiftPeriodSummary: {
          startDate: "2026-05-03",
          endDate: "2026-05-09",
          dayCount: 7,
          activeStaffCount: 0,
          scheduledStaffCount: 0,
          totalScheduledHours: 0,
          totalShifts: 0,
          totalAbsences: 0,
          overtimeAlertCount: 0,
          openSlotCount: 0,
          coveragePct: null,
          requestCount: 0,
        },
        shiftRequests: [],
        absencesCalloffs: [],
        rosterStatus: [],
        certificationRoleMatrix: [],
        accountAccess: [],
        scheduleMatrix: { dates: [], rows: [] },
      },
    });
    buildOperationsReportCsv.mockReturnValue("Employee,Hours\r\nAvery,8");
    buildOperationsReportPdf.mockReturnValue(
      new TextEncoder().encode("%PDF-1.4").buffer,
    );
  });

  it("validates org ids before resolving permissions", async () => {
    const response = await GET_REPORT(
      makeReportRequest("orgId=bad&startDate=2026-05-03&endDate=2026-05-09"),
    );

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("rejects reversed and overlong date ranges", async () => {
    const reversed = await GET_REPORT(
      makeReportRequest(`orgId=${ORG_ID}&startDate=2026-05-10&endDate=2026-05-09`),
    );
    const overlong = await GET_REPORT(
      makeReportRequest(`orgId=${ORG_ID}&startDate=2026-01-01&endDate=2026-04-15`),
    );

    expect(reversed.status).toBe(400);
    expect(overlong.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });

  it("authorizes organization admins and super admins only", async () => {
    await GET_REPORT(makeReportRequest());

    expect(requireOrgPermissions).toHaveBeenCalledWith(
      expect.any(NextRequest),
      ORG_ID,
      expect.any(Function),
    );
    const isAllowed = requireOrgPermissions.mock.calls[0][2];
    expect(isAllowed({ role: "admin", isSuperAdmin: false })).toBe(true);
    expect(isAllowed({ role: "user", isSuperAdmin: true })).toBe(true);
    expect(
      isAllowed({
        role: "user",
        isSuperAdmin: false,
        canViewDashboardAnalytics: true,
      }),
    ).toBe(false);
  });

  it("returns the operations report as no-store JSON", async () => {
    const response = await GET_REPORT(makeReportRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ orgId: ORG_ID });
    expect(loadOperationsReport).toHaveBeenCalledWith(expect.any(Object), {
      orgId: ORG_ID,
      range: { startDate: "2026-05-03", endDate: "2026-05-09" },
      filters: { employeeIds: [], focusAreaIds: [], dates: [] },
    });
  });

  it("passes validated target filters into report loading", async () => {
    const response = await GET_REPORT(
      makeReportRequest(
        `orgId=${ORG_ID}&startDate=2026-05-03&endDate=2026-05-09&employeeIds=22222222-2222-4222-8222-222222222222&focusAreaIds=10,11&dates=2026-05-03,2026-05-06`,
      ),
    );

    expect(response.status).toBe(200);
    expect(loadOperationsReport).toHaveBeenCalledWith(expect.any(Object), {
      orgId: ORG_ID,
      range: { startDate: "2026-05-03", endDate: "2026-05-09" },
      filters: {
        employeeIds: ["22222222-2222-4222-8222-222222222222"],
        focusAreaIds: [10, 11],
        dates: ["2026-05-03", "2026-05-06"],
      },
    });
  });

  it("rejects target dates outside the selected range", async () => {
    const response = await GET_REPORT(
      makeReportRequest(
        `orgId=${ORG_ID}&startDate=2026-05-03&endDate=2026-05-09&dates=2026-05-12`,
      ),
    );

    expect(response.status).toBe(400);
    expect(loadOperationsReport).not.toHaveBeenCalled();
  });

  it("passes through unauthenticated or forbidden permission responses", async () => {
    requireOrgPermissions.mockResolvedValueOnce({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const response = await GET_REPORT(makeReportRequest());

    expect(response.status).toBe(401);
    expect(loadOperationsReport).not.toHaveBeenCalled();
  });

  it("streams CSV exports with audit logging", async () => {
    const response = await GET_EXPORT(makeExportRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="reports-staff-hours-2026-05-03-2026-05-09.csv"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Employee,Hours\r\nAvery,8");
    expect(auditInsert).toHaveBeenCalledWith({
      org_id: ORG_ID,
      actor_id: "user-1",
      actor_email: "owner@example.com",
      action: "data.exported",
      resource_type: "data_export",
      resource_id: "staff-hours",
      details: {
        type: "reports.operations",
        report: "staff-hours",
        format: "csv",
        filters: { employeeIds: [], focusAreaIds: [], dates: [] },
        startDate: "2026-05-03",
        endDate: "2026-05-09",
      },
    });
  });

  it("streams PDF exports with audit logging", async () => {
    const response = await GET_EXPORT(
      makeExportRequest(
        `orgId=${ORG_ID}&startDate=2026-05-03&endDate=2026-05-09&report=staff-hours&format=pdf`,
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="reports-staff-hours-2026-05-03-2026-05-09.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("%PDF-1.4");
    expect(buildOperationsReportPdf).toHaveBeenCalledWith(expect.any(Object), "staff-hours");
    expect(auditInsert).toHaveBeenCalledWith({
      org_id: ORG_ID,
      actor_id: "user-1",
      actor_email: "owner@example.com",
      action: "data.exported",
      resource_type: "data_export",
      resource_id: "staff-hours",
      details: {
        type: "reports.operations",
        report: "staff-hours",
        format: "pdf",
        filters: { employeeIds: [], focusAreaIds: [], dates: [] },
        startDate: "2026-05-03",
        endDate: "2026-05-09",
      },
    });
  });

  it("rejects unknown export report types", async () => {
    const response = await GET_EXPORT(
      makeExportRequest(
        `orgId=${ORG_ID}&startDate=2026-05-03&endDate=2026-05-09&report=bogus`,
      ),
    );

    expect(response.status).toBe(400);
    expect(requireOrgPermissions).not.toHaveBeenCalled();
  });
});
