import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportsPageContent from "./ReportsPageContent";

const usePermissions = vi.fn();
const useOrganizationData = vi.fn();
const useClientFeatureFlags = vi.fn();
const fetchOperationsReport = vi.fn();
const exportOperationsReportCsv = vi.fn();
const exportOperationsReportPdf = vi.fn();
const toastInfo = vi.fn();
const toastSuccess = vi.fn();
const routerReplace = vi.fn();
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatRangeLabel(start: Date, end: Date): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getCurrentWeekOptionLabel(): string {
  const today = new Date();
  const start = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return `Current week (${formatRangeLabel(start, addDays(start, 6))})`;
}

function getCurrentPayPeriodOptionLabel(anchorDate: string): string {
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const periodIndex = Math.floor((todayUtc.getTime() - anchor.getTime()) / (14 * 86_400_000));
  const start = addDays(anchor, periodIndex * 14);
  return `Pay period (${formatRangeLabel(start, addDays(start, 13))})`;
}

vi.mock("@/components/RouteGuards", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/SetupGuard", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ProgressBar", () => ({
  default: () => <div data-testid="progress" />,
}));

vi.mock("@/hooks", () => ({
  usePermissions: () => usePermissions(),
  useOrganizationData: (options?: unknown) => useOrganizationData(options),
  useClientFeatureFlags: () => useClientFeatureFlags(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: vi.fn(),
  },
}));

vi.mock("lucide-react", () => ({
  CalendarDays: () => <span data-testid="calendar-icon" />,
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  ChevronLeft: () => <span data-testid="chevron-left-icon" />,
  ChevronRight: () => <span data-testid="chevron-right-icon" />,
  FileText: () => <span data-testid="file-text-icon" />,
  FileUp: () => <span data-testid="file-up-icon" />,
  // The export buttons now render <ButtonLoading>, whose spinner is this icon.
  Loader: () => <span data-testid="loader-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
  Upload: () => <span data-testid="upload-icon" />,
  X: () => <span data-testid="x-icon" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

vi.mock("@/features/reports/client/api", () => ({
  REPORT_OPTIONS: [
    { value: "employee-directory", label: "Employee directory" },
    { value: "staff-hours", label: "Staff hours" },
    { value: "staff-activity", label: "Staff activity" },
    { value: "mentoring-hours", label: "Mentoring hours" },
    { value: "mentoring-detail", label: "Mentoring detail" },
    { value: "coverage", label: "Coverage" },
    { value: "certification-role-matrix", label: "Certifications and roles" },
    { value: "account-access", label: "Account access" },
    { value: "shift-requests", label: "Shift requests" },
  ],
  fetchOperationsReport: (...args: unknown[]) => fetchOperationsReport(...args),
  exportOperationsReportCsv: (...args: unknown[]) => exportOperationsReportCsv(...args),
  exportOperationsReportPdf: (...args: unknown[]) => exportOperationsReportPdf(...args),
}));

const payload = {
  orgId: "11111111-1111-4111-8111-111111111111",
  orgName: "Acme",
  orgTimezone: "America/Los_Angeles",
  generatedAt: "2026-05-05T00:00:00.000Z",
  range: { startDate: "2026-05-03", endDate: "2026-05-09" },
  payPeriodStartDate: "2026-04-19",
  filters: { employeeIds: [], focusAreaIds: [], dates: [] },
  filterOptions: {
    employees: [
      { id: EMPLOYEE_ID, label: "Avery Ng", status: "active", focusAreaIds: [10] },
      {
        id: "33333333-3333-4333-8333-333333333333",
        label: "Blake Diaz",
        status: "active",
        focusAreaIds: [11],
      },
    ],
    focusAreas: [
      { id: "10", label: "North" },
      { id: "11", label: "South" },
    ],
    shiftCategories: [{ id: "60", label: "Day" }],
    jobs: [{ id: "70", label: "Caregiver" }],
    dates: [
      "2026-05-03",
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
      "2026-05-09",
    ],
  },
  reports: {
    employeeDirectory: [
      {
        employeeId: "emp-1",
        employeeNumber: 1001,
        employeeName: "Avery Ng",
        status: "active",
        employmentType: "full_time",
        email: "avery@example.com",
        phone: "555-0101",
        focusAreas: "North",
        roles: "RN",
        certification: "CNA",
        departments: "Care",
      },
    ],
    staffHours: [
      {
        employeeId: "emp-1",
        employeeName: "Avery Ng",
        status: "active",
        focusAreas: "North",
        scheduledHours: 8,
        shiftCount: 1,
        workedDays: 1,
        absenceCount: 0,
        overtimeHours: 0,
        overtime: false,
        shiftBreakdown: "Day (1, 8h)",
      },
      {
        employeeId: "emp-2",
        employeeName: "Blake Diaz",
        status: "active",
        focusAreas: "South",
        scheduledHours: 6,
        shiftCount: 1,
        workedDays: 1,
        absenceCount: 0,
        overtimeHours: 0,
        overtime: false,
        shiftBreakdown: "Evening (1, 6h)",
      },
    ],
    mentoringHours: [
      {
        employeeId: "emp-1",
        employeeName: "Avery Ng",
        mentoringHours: 8,
        mentoredAssignmentCount: 1,
        mentoredDays: 1,
      },
    ],
    mentoringDetail: [
      {
        employeeId: "emp-1",
        employeeName: "Avery Ng",
        date: "2026-05-03",
        focusArea: "North",
        shift: "Day",
        job: "Caregiver",
        startTime: "07:00",
        endTime: "15:00",
        mentoringHours: 8,
      },
    ],
    coverage: [],
    shiftPeriodSummary: {
      startDate: "2026-05-03",
      endDate: "2026-05-09",
      dayCount: 7,
      activeStaffCount: 1,
      scheduledStaffCount: 1,
      totalScheduledHours: 8,
      totalShifts: 1,
      totalAbsences: 0,
      overtimeAlertCount: 0,
      openSlotCount: 0,
      coveragePct: null,
      requestCount: 0,
    },
    shiftRequests: [],
    absencesCalloffs: [],
    rosterStatus: [],
    certificationRoleMatrix: [
      {
        employeeId: "emp-1",
        employeeNumber: 1001,
        employeeName: "Avery Ng",
        status: "active",
        certification: "CNA",
        roles: "RN",
        focusAreas: "North",
        departments: "Care",
        missingCertification: false,
        missingRole: false,
      },
    ],
    accountAccess: [
      {
        employeeId: "emp-1",
        employeeNumber: 1001,
        employeeName: "Avery Ng",
        status: "active",
        email: "avery@example.com",
        linkedAccount: true,
        pendingInvitation: "",
        accountAccessStatus: "Linked",
      },
    ],
    scheduleMatrix: { dates: [], rows: [] },
  },
};

function renderReports() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsPageContent />
    </QueryClientProvider>,
  );
}

async function chooseCustomSelect(label: string, option: string | RegExp) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

async function selectExportFormat(format: "CSV" | "PDF") {
  fireEvent.click(screen.getByRole("button", { name: "Export" }));
  const menuItem = await screen.findByRole("menuitem", { name: `Export ${format}` });
  // The export handler settles its own loading state after awaiting the
  // download, so let those updates flush inside act.
  await act(async () => {
    fireEvent.click(menuItem);
  });
}

describe("ReportsPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePermissions.mockReturnValue({
      isLoading: false,
      role: "admin",
      orgId: "11111111-1111-4111-8111-111111111111",
      isUserViewActive: false,
    });
    useOrganizationData.mockReturnValue({
      org: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Acme",
        payPeriodStartDate: "2026-04-19",
      },
      loading: false,
    });
    useClientFeatureFlags.mockReturnValue({
      stripe: true,
      csvImport: true,
      csvExport: true,
      reports: true,
      printing: true,
    });
    fetchOperationsReport.mockResolvedValue(payload);
    exportOperationsReportCsv.mockResolvedValue(undefined);
    exportOperationsReportPdf.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps preview gated behind Generate report", async () => {
    renderReports();
    const currentWeekOptionLabel = getCurrentWeekOptionLabel();
    const payPeriodOptionLabel = getCurrentPayPeriodOptionLabel("2026-04-19");

    expect(await screen.findByRole("heading", { name: "Reports" })).toHaveStyle({
      fontSize: "var(--dg-fs-page-title)",
      fontWeight: "800",
    });
    expect(screen.queryByRole("heading", { name: "Configure report" })).not.toBeInTheDocument();
    expect(screen.queryByText("Acme")).not.toBeInTheDocument();
    expect(screen.queryByText("2026-05-03 to 2026-05-09")).not.toBeInTheDocument();
    expect(screen.getByTestId("reports-content")).toHaveStyle({
      maxWidth: "none",
      width: "100%",
    });
    const runActions = screen.getByTestId("reports-run-actions");
    expect(runActions).toHaveStyle({
      justifyContent: "flex-end",
    });
    expect(screen.getByTestId("reports-filter-controls")).toHaveStyle({
      display: "grid",
    });
    expect(
      Array.from(runActions.querySelectorAll("button")).map((button) => button.textContent?.trim()),
    ).toEqual(["Refresh", "Close", "Generate report"]);
    expect(screen.getByLabelText("Report")).toBeInTheDocument();
    expect(screen.getByLabelText("Range")).toHaveTextContent(currentWeekOptionLabel);
    fireEvent.click(screen.getByLabelText("Range"));
    expect(await screen.findByRole("option", { name: currentWeekOptionLabel })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Next week/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Two weeks/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: payPeriodOptionLabel })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Custom" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: currentWeekOptionLabel }));
    expect(screen.queryByText("Scheduled hours")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    expect((await screen.findAllByText("Avery Ng")).length).toBeGreaterThan(0);
    const blakeRow = screen
      .getAllByText("Blake Diaz")
      .map((element) => element.closest("tr"))
      .find(Boolean);
    expect(blakeRow).toBeTruthy();
    expect(blakeRow!).toHaveStyle({
      background: "var(--dg-color-bg-secondary)",
    });
    expect(screen.getAllByText("Scheduled hours").length).toBeGreaterThan(1);
    expect(fetchOperationsReport).toHaveBeenCalledWith({
      orgId: "11111111-1111-4111-8111-111111111111",
      range: expect.any(Object),
      filters: { employeeIds: [], focusAreaIds: [], dates: [] },
    });
  });

  it("changes report views and exports the selected report as CSV and PDF", async () => {
    renderReports();

    await chooseCustomSelect("Report", "Employee directory");
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect(await screen.findByText("Staff status")).toBeInTheDocument();
    expect(screen.getByText("Full-time")).toBeInTheDocument();
    expect(screen.queryByText("full_time")).not.toBeInTheDocument();
    const exportButton = screen.getByRole("button", { name: "Export" });
    await waitFor(() => expect(exportButton).not.toBeDisabled());
    expect(exportButton).toHaveAttribute("aria-haspopup", "menu");
    await selectExportFormat("CSV");

    await waitFor(() => {
      expect(exportOperationsReportCsv).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: expect.any(Object),
        report: "employee-directory",
        filters: { employeeIds: [], focusAreaIds: [], dates: [] },
      });
    });
    expect(toastSuccess).toHaveBeenCalledWith("CSV report exported");

    await selectExportFormat("PDF");

    await waitFor(() => {
      expect(exportOperationsReportPdf).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: expect.any(Object),
        report: "employee-directory",
        filters: { employeeIds: [], focusAreaIds: [], dates: [] },
      });
    });
    expect(toastSuccess).toHaveBeenCalledWith("PDF report exported");
  });

  it("shows and exports mentoring summary and detail reports", async () => {
    renderReports();

    await chooseCustomSelect("Report", "Mentoring hours");
    expect(screen.getByRole("button", { name: "Dates" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dates" }));
    fireEvent.click(await screen.findByLabelText("May 3, 2026"));
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect((await screen.findAllByText("Mentored assignments")).length).toBeGreaterThan(1);
    expect(screen.getByText("Staff mentored")).toBeInTheDocument();

    await chooseCustomSelect("Report", "Mentoring detail");
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect(await screen.findByText("Focus area")).toBeInTheDocument();
    expect(screen.getByText("Caregiver")).toBeInTheDocument();

    await selectExportFormat("CSV");
    await waitFor(() => {
      expect(exportOperationsReportCsv).toHaveBeenCalledWith(
        expect.objectContaining({
          report: "mentoring-detail",
          filters: { employeeIds: [], focusAreaIds: [], dates: ["2026-05-03"] },
        }),
      );
    });
  });

  it("disables exports when a generated report has no rows", async () => {
    renderReports();

    await chooseCustomSelect("Report", "Shift requests");
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => {
      expect(screen.getByText("No matching requests for this range.")).toBeInTheDocument();
    });

    expect(screen.getByTestId("reports-empty-state").style.border).toContain("dashed");
    expect(screen.queryByText("Requests")).not.toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("scopes staff reports to selected people, shift categories, and jobs", async () => {
    renderReports();

    fireEvent.click(screen.getByRole("button", { name: "People" }));
    fireEvent.click(await screen.findByLabelText("Avery Ng"));
    fireEvent.click(screen.getByRole("button", { name: "Shift categories" }));
    fireEvent.click(await screen.findByLabelText("Day"));
    fireEvent.click(screen.getByRole("button", { name: "Jobs" }));
    fireEvent.click(await screen.findByLabelText("Caregiver"));
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => {
      expect(fetchOperationsReport).toHaveBeenLastCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: expect.any(Object),
        filters: {
          employeeIds: [EMPLOYEE_ID],
          focusAreaIds: [],
          shiftCategoryIds: [60],
          jobIds: [70],
          dates: [],
        },
      });
    });
  });

  it("hides range controls for employee directory reports", async () => {
    renderReports();

    await chooseCustomSelect("Report", "Employee directory");

    expect(screen.queryByLabelText("Range")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Date range")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /People/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Focus areas/ })).toBeInTheDocument();
    expect(screen.queryByText(/ to /)).not.toBeInTheDocument();
  });

  it("shows the custom calendar only after choosing a custom date range", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-05T00:00:00.000Z"));
    renderReports();

    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
    expect(screen.getByLabelText("Range")).toBeInTheDocument();
    expect(screen.queryByLabelText("Date range")).not.toBeInTheDocument();
    await chooseCustomSelect("Range", "Custom");
    expect(screen.getByLabelText("Range")).toHaveTextContent("Custom");
    fireEvent.click(screen.getByLabelText("Date range"));
    expect(await screen.findByText("Select start date")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "May 4, 2026" }));
    expect(await screen.findByText("Select end date for May 4, 2026")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "May 8, 2026" }));
    expect(screen.getByLabelText("Date range")).toHaveStyle({
      minWidth: "0",
      width: "100%",
    });
    expect(screen.getByText("May 4, 2026 - May 8, 2026")).toHaveStyle({
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    expect(screen.getByLabelText("Range")).toHaveTextContent("Custom (May 4 - May 8)");

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => {
      expect(fetchOperationsReport).toHaveBeenLastCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: { startDate: "2026-05-04", endDate: "2026-05-08" },
        filters: { employeeIds: [], focusAreaIds: [], dates: [] },
      });
    });
  });

  it("shows only focus-area targets for coverage reports", async () => {
    renderReports();

    await chooseCustomSelect("Report", "Coverage");

    expect(screen.getByLabelText("Range")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Focus areas/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /People/ })).not.toBeInTheDocument();
  });

  it("uses matching collapsed and open chrome for people and focus-area targets", async () => {
    renderReports();

    const focusTarget = await screen.findByRole("button", { name: "Focus areas" });
    const peopleTarget = screen.getByRole("button", { name: "People" });

    expect(focusTarget).toHaveClass("dg-input");
    expect(peopleTarget).toHaveClass("dg-input");
    expect(focusTarget).toHaveStyle({ minHeight: "40px" });
    expect(peopleTarget).toHaveStyle({ minHeight: "40px" });

    fireEvent.click(focusTarget);
    await waitFor(() => {
      expect(screen.getAllByText("Focus areas").length).toBeGreaterThan(1);
    });
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  it("applies top-level focus area and people targets to refetches and exports", async () => {
    renderReports();

    fireEvent.click(screen.getByRole("button", { name: /Focus areas/ }));
    fireEvent.click(await screen.findByLabelText("North"));

    fireEvent.click(screen.getByRole("button", { name: /People/ }));
    fireEvent.click(await screen.findByLabelText("Avery Ng"));

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => {
      expect(fetchOperationsReport).toHaveBeenLastCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: expect.any(Object),
        filters: {
          employeeIds: [EMPLOYEE_ID],
          focusAreaIds: [10],
          dates: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export" })).not.toBeDisabled();
    });
    await selectExportFormat("CSV");

    await waitFor(() => {
      expect(exportOperationsReportCsv).toHaveBeenCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: expect.any(Object),
        report: "staff-hours",
        filters: {
          employeeIds: [EMPLOYEE_ID],
          focusAreaIds: [10],
          dates: [],
        },
      });
    });
  });

  it("limits people targets to the selected focus areas and prunes stale people", async () => {
    renderReports();

    fireEvent.click(await screen.findByRole("button", { name: "People" }));
    fireEvent.click(await screen.findByLabelText("Avery Ng"));
    expect(screen.getByRole("button", { name: "People" })).toHaveTextContent("1 selected");

    fireEvent.click(screen.getByRole("button", { name: "Focus areas" }));
    fireEvent.click(await screen.findByLabelText("South"));

    expect(screen.getByRole("button", { name: "People" })).toHaveTextContent("All people");

    fireEvent.click(screen.getByRole("button", { name: "People" }));

    expect(await screen.findByLabelText("Blake Diaz")).toBeInTheDocument();
    expect(screen.queryByLabelText("Avery Ng")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Blake Diaz"));
    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));

    await waitFor(() => {
      expect(fetchOperationsReport).toHaveBeenLastCalledWith({
        orgId: "11111111-1111-4111-8111-111111111111",
        range: expect.any(Object),
        filters: {
          employeeIds: ["33333333-3333-4333-8333-333333333333"],
          focusAreaIds: [11],
          dates: [],
        },
      });
    });
  });

  it("clears stale preview and irrelevant controls when switching report types", async () => {
    renderReports();

    fireEvent.click(screen.getByRole("button", { name: "Generate report" }));
    expect((await screen.findAllByText("Scheduled hours")).length).toBeGreaterThan(1);

    await chooseCustomSelect("Report", "Employee directory");

    expect(screen.queryByText("Scheduled hours")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Range")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("blocks non-admin users before rendering report data", async () => {
    usePermissions.mockReturnValue({
      isLoading: false,
      role: "user",
      orgId: "11111111-1111-4111-8111-111111111111",
      isUserViewActive: false,
    });

    renderReports();

    await waitFor(() => {
      expect(toastInfo).toHaveBeenCalledWith("Reports are available to admins and super admins.");
      expect(routerReplace).toHaveBeenCalledWith("/dashboard");
    });
    expect(fetchOperationsReport).not.toHaveBeenCalled();
  });

  it("redirects admins away when the reports feature flag is off", async () => {
    useClientFeatureFlags.mockReturnValue({
      stripe: true,
      csvImport: true,
      csvExport: true,
      reports: false,
      printing: true,
    });

    renderReports();

    await waitFor(() => {
      expect(toastInfo).toHaveBeenCalledWith(
        "Reports are unavailable right now. Try again in a moment.",
      );
      expect(routerReplace).toHaveBeenCalledWith("/dashboard");
    });
    expect(fetchOperationsReport).not.toHaveBeenCalled();
  });
});
