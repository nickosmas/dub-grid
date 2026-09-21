"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ChevronDown, FileText, FileUp, RefreshCw, Upload, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import CustomSelect, { type SelectOption } from "@/components/CustomSelect";
import DateRangePicker from "@/components/ui/date-range-picker";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useClientFeatureFlags, useOrganizationData, usePermissions } from "@/hooks";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import {
  REPORT_OPTIONS,
  exportOperationsReportCsv,
  exportOperationsReportPdf,
  fetchOperationsReport,
  fetchOperationsReportFilterOptions,
} from "@/features/reports/client/api";
import {
  type OperationsReportFilters,
  type OperationsReportPayload,
  type OperationsReportRange,
  type OperationsReportType,
} from "@/features/reports/server/operations";
import {
  buildOperationsReportMetrics,
  buildOperationsReportPreviewTable,
  formatReportCellForDisplay,
} from "@/features/reports/shared/table";

type QuickRange = "current-week" | "pay-period" | "custom";
type ReportTargetControl =
  "people" | "focusAreas" | "shiftCategories" | "jobs" | "indicators" | "dates";
type ReportUiMetadata = {
  usesDateRange: boolean;
  targetControls: ReportTargetControl[];
};

type TargetEmployeeOption = OperationsReportPayload["filterOptions"]["employees"][number];

const QUICK_RANGES: Array<{ value: QuickRange; label: string }> = [
  { value: "current-week", label: "Current week" },
  { value: "pay-period", label: "Pay period" },
  { value: "custom", label: "Custom" },
];

const QUICK_RANGE_LABELS = new Map<QuickRange, string>(
  QUICK_RANGES.map((option) => [option.value, option.label]),
);

const EMPTY_REPORT_FILTERS: OperationsReportFilters = {
  employeeIds: [],
  focusAreaIds: [],
  dates: [],
};

const REPORT_UI_METADATA: Record<OperationsReportType, ReportUiMetadata> = {
  "employee-directory": {
    usesDateRange: false,
    targetControls: ["people", "focusAreas"],
  },
  "staff-hours": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas", "shiftCategories", "jobs", "indicators"],
  },
  "staff-activity": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas", "shiftCategories", "jobs", "indicators"],
  },
  "mentoring-hours": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas", "dates"],
  },
  "mentoring-detail": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas", "dates"],
  },
  coverage: {
    usesDateRange: true,
    targetControls: ["focusAreas"],
  },
  "shift-period-summary": {
    usesDateRange: true,
    targetControls: ["focusAreas"],
  },
  "shift-requests": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas"],
  },
  "absences-calloffs": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas"],
  },
  "roster-status": {
    usesDateRange: false,
    targetControls: ["people", "focusAreas"],
  },
  "certification-role-matrix": {
    usesDateRange: false,
    targetControls: ["people", "focusAreas"],
  },
  "account-access": {
    usesDateRange: false,
    targetControls: ["people", "focusAreas"],
  },
  "schedule-matrix": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas", "indicators"],
  },
  "shift-notes": {
    usesDateRange: true,
    targetControls: ["people", "focusAreas", "indicators", "dates"],
  },
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// NOTE: These date helpers are intentionally UTC-based and distinct from the
// local-time `getWeekStart`/`addDays` in `@/lib/utils`. The entire reports date
// pipeline runs on UTC ISO strings (`toIsoDate` -> `toISOString`, `parseIsoDate`,
// and every formatter passes `timeZone: "UTC"`), so week math must also be UTC —
// using the local-time shared helpers would shift the resulting ISO date by the
// viewer's timezone offset. Do not replace with the `@/lib/utils` versions.
function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getWeekStart(date: Date): Date {
  const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  return start;
}

function parseIsoDate(date: string): Date | null {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateLabel(date: string): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return date || "Choose date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatCompactRangeLabel(range: OperationsReportRange): string {
  const start = parseIsoDate(range.startDate);
  const end = parseIsoDate(range.endDate);
  if (!start || !end) return `${range.startDate} - ${range.endDate}`;
  const includeYear = start.getUTCFullYear() !== end.getUTCFullYear();
  const dateOptions: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  };
  if (includeYear) {
    dateOptions.year = "numeric";
  }
  const formatter = new Intl.DateTimeFormat("en-US", dateOptions);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function getDefaultRange(): OperationsReportRange {
  const start = getWeekStart(new Date());
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(addDays(start, 6)),
  };
}

function resolveQuickRange(
  quickRange: QuickRange,
  payPeriodStartDate: string | null | undefined,
): OperationsReportRange | null {
  const weekStart = getWeekStart(new Date());
  if (quickRange === "current-week") {
    return {
      startDate: toIsoDate(weekStart),
      endDate: toIsoDate(addDays(weekStart, 6)),
    };
  }
  if (quickRange === "pay-period") {
    return resolveCurrentPayPeriodRangeLocal(payPeriodStartDate);
  }
  return null;
}

function resolveCurrentPayPeriodRangeLocal(
  anchorDate: string | null | undefined,
): OperationsReportRange | null {
  if (!anchorDate) return null;
  const anchor = new Date(`${anchorDate}T00:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) return null;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const diffDays = Math.floor((todayUtc.getTime() - anchor.getTime()) / 86_400_000);
  const periodStart = addDays(anchor, Math.floor(diffDays / 14) * 14);
  return {
    startDate: toIsoDate(periodStart),
    endDate: toIsoDate(addDays(periodStart, 13)),
  };
}

function buildQuickRangeOptions(
  range: OperationsReportRange,
  payPeriodStartDate: string | null | undefined,
  customRangeSelected: boolean,
): SelectOption<QuickRange>[] {
  return QUICK_RANGES.map((option) => {
    const baseLabel = QUICK_RANGE_LABELS.get(option.value) ?? option.label;
    if (option.value === "custom" && !customRangeSelected) {
      return {
        value: option.value,
        label: baseLabel,
      };
    }
    const resolved =
      option.value === "custom" ? range : resolveQuickRange(option.value, payPeriodStartDate);
    const rangeLabel = resolved ? formatCompactRangeLabel(resolved) : "not set";
    return {
      value: option.value,
      label: `${baseLabel} (${rangeLabel})`,
    };
  });
}

function serializeFilters(filters: OperationsReportFilters): string {
  return JSON.stringify({
    employeeIds: [...(filters.employeeIds ?? [])].sort(),
    focusAreaIds: [...(filters.focusAreaIds ?? [])].sort((left, right) => left - right),
    shiftCategoryIds: [...(filters.shiftCategoryIds ?? [])].sort((left, right) => left - right),
    jobIds: [...(filters.jobIds ?? [])].sort((left, right) => left - right),
    indicatorTypeIds: [...(filters.indicatorTypeIds ?? [])].sort((left, right) => left - right),
    dates: [...(filters.dates ?? [])].sort(),
  });
}

function employeeMatchesFocusAreas(
  employee: TargetEmployeeOption,
  focusAreaIds: number[],
): boolean {
  if (focusAreaIds.length === 0) return true;
  return employee.focusAreaIds.some((id) => focusAreaIds.includes(id));
}

function TargetDropdown({
  children,
  clearDisabled = false,
  disabled = false,
  onClear,
  summary,
  title,
}: {
  title: string;
  summary: string;
  disabled?: boolean;
  clearDisabled?: boolean;
  onClear?: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={controlLabelStyle}>
      {title}
      <Button
        ref={anchorRef}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="dg-input"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        style={targetDropdownButtonStyle}
        type="button"
      >
        <span style={targetDropdownSummaryStyle}>{summary}</span>
        <ChevronDown
          size={16}
          style={{
            color: "var(--dg-color-text-faint)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent
          anchor={anchorRef}
          align="start"
          className="dg-menu"
          collisionPadding={12}
          positionMethod="fixed"
          side="bottom"
          sideOffset={6}
          style={targetDropdownPopoverStyle}
        >
          {onClear ? (
            <div style={targetDropdownHeaderStyle}>
              <div style={targetDropdownTitleStyle}>{title}</div>
              <Button
                className="dg-btn dg-btn-secondary"
                disabled={clearDisabled}
                onClick={onClear}
                style={targetClearButtonStyle}
                type="button"
              >
                Clear
              </Button>
            </div>
          ) : null}
          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ExportMenu({
  disabled,
  exportingFormat,
  onExport,
}: {
  disabled: boolean;
  exportingFormat: "csv" | "pdf" | null;
  onExport: (format: "csv" | "pdf") => void;
}) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const selectFormat = (format: "csv" | "pdf") => {
    setOpen(false);
    onExport(format);
  };

  return (
    <>
      <Button
        ref={anchorRef}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Export"
        className="dg-btn dg-btn-primary"
        disabled={disabled}
        icon={<Upload size={16} />}
        // Selecting a format closes the popover, so the spinner on the menu
        // items below never gets to render. The trigger is what stays on
        // screen for the export, so it carries the pending state.
        loading={exportingFormat != null}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        Export
        <ChevronDown size={16} />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverContent
          anchor={anchorRef}
          align="end"
          className="dg-menu"
          collisionPadding={12}
          positionMethod="fixed"
          side="bottom"
          sideOffset={6}
          role="menu"
          style={{ minWidth: "var(--anchor-width)" }}
        >
          <Button
            className="dg-menu-item"
            disabled={exportingFormat != null}
            icon={<FileUp size={16} />}
            loading={exportingFormat === "pdf"}
            onClick={() => selectFormat("pdf")}
            role="menuitem"
            type="button"
          >
            Export PDF
          </Button>
          <Button
            className="dg-menu-item"
            disabled={exportingFormat != null}
            icon={<Upload size={16} />}
            loading={exportingFormat === "csv"}
            onClick={() => selectFormat("csv")}
            role="menuitem"
            type="button"
          >
            Export CSV
          </Button>
        </PopoverContent>
      </Popover>
    </>
  );
}

function ReportsContent() {
  const router = useRouter();
  const permissions = usePermissions();
  const featureFlags = useClientFeatureFlags();
  const { org, loading: orgLoading } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
  });
  const hasReportsPermission =
    !permissions.isUserViewActive &&
    (permissions.isSuperAdmin === true || permissions.canViewReports === true);
  const canAccessReports = hasReportsPermission && featureFlags.reports;
  const orgId = permissions.orgId ?? org?.id ?? null;
  const [report, setReport] = useState<OperationsReportType>("staff-hours");
  const [quickRange, setQuickRange] = useState<QuickRange>("current-week");
  const [range, setRange] = useState<OperationsReportRange>(() => getDefaultRange());
  const [customRangeSelected, setCustomRangeSelected] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedFocusAreaIds, setSelectedFocusAreaIds] = useState<number[]>([]);
  const [selectedShiftCategoryIds, setSelectedShiftCategoryIds] = useState<number[]>([]);
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [selectedIndicatorTypeIds, setSelectedIndicatorTypeIds] = useState<number[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [appliedRequest, setAppliedRequest] = useState<{
    range: OperationsReportRange;
    filters: OperationsReportFilters;
    filtersKey: string;
  } | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "pdf" | null>(null);
  const reportMetadata = REPORT_UI_METADATA[report];
  const showsPeopleTarget = reportMetadata.targetControls.includes("people");
  const showsFocusAreaTarget = reportMetadata.targetControls.includes("focusAreas");
  const showsShiftCategoryTarget = reportMetadata.targetControls.includes("shiftCategories");
  const showsJobTarget = reportMetadata.targetControls.includes("jobs");
  const showsIndicatorTarget = reportMetadata.targetControls.includes("indicators");
  const showsDatesTarget = reportMetadata.targetControls.includes("dates");
  const reportFilters = useMemo<OperationsReportFilters>(
    () => ({
      employeeIds: showsPeopleTarget ? selectedEmployeeIds : [],
      focusAreaIds: showsFocusAreaTarget ? selectedFocusAreaIds : [],
      shiftCategoryIds:
        showsShiftCategoryTarget && selectedShiftCategoryIds.length > 0
          ? selectedShiftCategoryIds
          : undefined,
      jobIds: showsJobTarget && selectedJobIds.length > 0 ? selectedJobIds : undefined,
      indicatorTypeIds:
        showsIndicatorTarget && selectedIndicatorTypeIds.length > 0
          ? selectedIndicatorTypeIds
          : undefined,
      dates: showsDatesTarget ? selectedDates : [],
    }),
    [
      selectedDates,
      selectedEmployeeIds,
      selectedFocusAreaIds,
      selectedIndicatorTypeIds,
      selectedJobIds,
      selectedShiftCategoryIds,
      showsDatesTarget,
      showsFocusAreaTarget,
      showsIndicatorTarget,
      showsJobTarget,
      showsPeopleTarget,
      showsShiftCategoryTarget,
    ],
  );
  const filtersKey = useMemo(() => serializeFilters(reportFilters), [reportFilters]);
  const reportOptions = REPORT_OPTIONS as SelectOption<OperationsReportType>[];
  const quickRangeOptions = useMemo(
    () => buildQuickRangeOptions(range, org?.payPeriodStartDate, customRangeSelected),
    [customRangeSelected, org?.payPeriodStartDate, range],
  );

  useEffect(() => {
    if (permissions.isLoading) return;
    if (!hasReportsPermission) {
      toast.info("Reports aren't included in your permissions.");
      router.replace("/dashboard");
    } else if (!featureFlags.reports) {
      toast.info("Reports are unavailable right now. Try again in a moment.");
      router.replace("/dashboard");
    }
  }, [hasReportsPermission, featureFlags.reports, permissions.isLoading, router]);

  const resetAppliedReport = () => {
    setAppliedRequest(null);
  };

  const updateRange = (nextRange: OperationsReportRange) => {
    setRange(nextRange);
    setSelectedDates([]);
    resetAppliedReport();
  };

  const updateCustomRange = (nextRange: OperationsReportRange) => {
    setCustomRangeSelected(true);
    updateRange(nextRange);
  };

  const updateQuickRange = (nextQuickRange: QuickRange) => {
    setQuickRange(nextQuickRange);
    resetAppliedReport();
    if (nextQuickRange === "custom") return;
    setCustomRangeSelected(false);
    const resolved = resolveQuickRange(nextQuickRange, org?.payPeriodStartDate);
    if (resolved) {
      updateRange(resolved);
      return;
    }
    if (nextQuickRange === "pay-period") {
      toast.info("This organization does not have a pay period anchor.");
      setQuickRange("current-week");
      updateRange(resolveQuickRange("current-week", org?.payPeriodStartDate) ?? getDefaultRange());
    }
  };

  const handleReportChange = (nextReport: OperationsReportType) => {
    const nextMetadata = REPORT_UI_METADATA[nextReport];
    setReport(nextReport);
    if (!nextMetadata.targetControls.includes("people")) {
      setSelectedEmployeeIds([]);
    }
    if (!nextMetadata.targetControls.includes("focusAreas")) {
      setSelectedFocusAreaIds([]);
    }
    if (!nextMetadata.targetControls.includes("shiftCategories")) {
      setSelectedShiftCategoryIds([]);
    }
    if (!nextMetadata.targetControls.includes("jobs")) {
      setSelectedJobIds([]);
    }
    if (!nextMetadata.targetControls.includes("indicators")) {
      setSelectedIndicatorTypeIds([]);
    }
    if (!nextMetadata.targetControls.includes("dates")) {
      setSelectedDates([]);
    }
    resetAppliedReport();
  };

  // Dropdown lists only. This used to request the whole unfiltered report to
  // read five option arrays off it, then request the whole report again for
  // every filtered generate of the same range (build plan item 30).
  const targetOptionsQuery = useQuery({
    queryKey: orgId
      ? queryKeys.reports.operationsOptions(orgId, range.startDate, range.endDate)
      : ["reports", "operations", "options", "none"],
    queryFn: () => fetchOperationsReportFilterOptions({ orgId: orgId!, range }),
    enabled: Boolean(orgId) && canAccessReports && reportMetadata.targetControls.length > 0,
    staleTime: 30_000,
  });

  const reportsQuery = useQuery({
    queryKey:
      orgId && appliedRequest
        ? queryKeys.reports.operations(
            orgId,
            appliedRequest.range.startDate,
            appliedRequest.range.endDate,
            appliedRequest.filtersKey,
          )
        : ["reports", "operations", "preview", "none"],
    queryFn: () =>
      fetchOperationsReport({
        orgId: orgId!,
        range: appliedRequest!.range,
        filters: appliedRequest!.filters,
      }),
    enabled: Boolean(orgId) && canAccessReports && appliedRequest != null,
    staleTime: 30_000,
  });

  const preview = useMemo(
    () =>
      appliedRequest && reportsQuery.data
        ? buildOperationsReportPreviewTable(reportsQuery.data, report)
        : null,
    [appliedRequest, report, reportsQuery.data],
  );
  const metrics = useMemo(
    () =>
      appliedRequest && reportsQuery.data
        ? buildOperationsReportMetrics(reportsQuery.data, report)
        : [],
    [appliedRequest, report, reportsQuery.data],
  );
  const visibleRows = preview?.rows ?? [];
  const hasVisibleRows = preview != null && visibleRows.length > 0;
  const hasExportableRows = visibleRows.length > 0;
  const isLoading =
    permissions.isLoading || orgLoading || reportsQuery.isLoading || targetOptionsQuery.isLoading;
  const optionsPayload = targetOptionsQuery.data ?? reportsQuery.data;
  const employeeOptions = optionsPayload?.filterOptions.employees ?? [];
  const focusAreaOptions = optionsPayload?.filterOptions.focusAreas ?? [];
  const shiftCategoryOptions = optionsPayload?.filterOptions.shiftCategories ?? [];
  const jobOptions = optionsPayload?.filterOptions.jobs ?? [];
  const indicatorOptions = optionsPayload?.filterOptions.indicators ?? [];
  const dateOptions = optionsPayload?.filterOptions.dates ?? [];
  const visibleEmployeeOptions = useMemo(
    () =>
      employeeOptions.filter((employee) =>
        employeeMatchesFocusAreas(employee, selectedFocusAreaIds),
      ),
    [employeeOptions, selectedFocusAreaIds],
  );
  const focusAreaSummary =
    selectedFocusAreaIds.length === 0
      ? "All focus areas"
      : `${selectedFocusAreaIds.length} selected`;
  const peopleSummary =
    selectedEmployeeIds.length === 0 ? "All people" : `${selectedEmployeeIds.length} selected`;
  const datesSummary =
    selectedDates.length === 0 ? "All dates" : `${selectedDates.length} selected`;
  const shiftCategorySummary =
    selectedShiftCategoryIds.length === 0
      ? "All shift categories"
      : `${selectedShiftCategoryIds.length} selected`;
  const jobsSummary =
    selectedJobIds.length === 0 ? "All jobs" : `${selectedJobIds.length} selected`;
  const indicatorSummary =
    selectedIndicatorTypeIds.length === 0
      ? "All indicators"
      : `${selectedIndicatorTypeIds.length} selected`;

  if (permissions.isLoading || !canAccessReports) {
    return <ProgressBar loading />;
  }

  const handleExport = async (format: "csv" | "pdf") => {
    if (!orgId || !appliedRequest) return;
    setExportingFormat(format);
    try {
      if (format === "pdf") {
        await exportOperationsReportPdf({
          orgId,
          range: appliedRequest.range,
          report,
          filters: appliedRequest.filters,
        });
      } else {
        await exportOperationsReportCsv({
          orgId,
          range: appliedRequest.range,
          report,
          filters: appliedRequest.filters,
        });
      }
      toast.success(`${format.toUpperCase()} report exported`);
    } catch (error) {
      toast.error(formatClientErrorMessage(error, "Export failed"));
    } finally {
      setExportingFormat(null);
    }
  };

  const handleGenerateReport = () => {
    setAppliedRequest({
      range: { ...range },
      filters: reportFilters,
      filtersKey,
    });
  };

  const updateSelectedFocusAreas = (nextFocusAreaIds: number[]) => {
    resetAppliedReport();
    setSelectedFocusAreaIds(nextFocusAreaIds);
    setSelectedEmployeeIds((current) => {
      if (nextFocusAreaIds.length === 0) return current;
      const eligibleEmployeeIds = new Set(
        employeeOptions
          .filter((employee) => employeeMatchesFocusAreas(employee, nextFocusAreaIds))
          .map((employee) => employee.id),
      );
      return current.filter((employeeId) => eligibleEmployeeIds.has(employeeId));
    });
  };

  return (
    <main
      style={{
        minHeight: "calc(100vh - var(--dg-app-shell-header-height))",
        background: "var(--dg-color-bg)",
        color: "var(--dg-color-text-primary)",
        padding: "clamp(16px, 3vw, 32px) var(--dg-page-gutter)",
      }}
    >
      <ProgressBar loading={isLoading || reportsQuery.isFetching} />

      <div data-testid="reports-content" style={reportsContentStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "flex-start",
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                color: "var(--dg-color-text-primary)",
                fontSize: "var(--dg-type-page-title-size)",
                fontWeight: 700,
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              Reports
            </h1>
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              maxWidth: "100%",
              minWidth: 0,
            }}
          >
            <div data-testid="reports-run-actions" style={reportsRunActionsStyle}>
              <Button
                className="dg-btn dg-btn-secondary"
                disabled={!appliedRequest}
                onClick={() => reportsQuery.refetch()}
                type="button"
              >
                <RefreshCw size={16} />
                Refresh
              </Button>
              <Button
                className="dg-btn dg-btn-secondary"
                disabled={!appliedRequest}
                onClick={resetAppliedReport}
                type="button"
              >
                <X size={16} />
                Close
              </Button>
              <Button
                className="dg-btn dg-btn-primary"
                icon={<FileText size={16} />}
                onClick={handleGenerateReport}
                type="button"
              >
                Generate report
              </Button>
            </div>
            <ExportMenu
              disabled={
                !appliedRequest ||
                !reportsQuery.data ||
                !hasExportableRows ||
                exportingFormat != null
              }
              exportingFormat={exportingFormat}
              onExport={handleExport}
            />
          </div>
        </div>

        <section data-testid="reports-settings" style={reportsSettingsStyle}>
          <div style={reportsSettingsHeaderStyle}>
            <div>
              <p style={reportsSettingsDescriptionStyle}>
                Choose the report, period, and optional filters before generating a preview.
              </p>
            </div>
          </div>
          <div data-testid="reports-filter-controls" style={reportsFilterControlsStyle}>
            <label style={controlLabelStyle}>
              Report
              <CustomSelect
                ariaLabel="Report"
                height={40}
                onChange={handleReportChange}
                options={reportOptions}
                style={fullWidthControlStyle}
                value={report}
              />
            </label>
            {reportMetadata.usesDateRange ? (
              <label style={controlLabelStyle}>
                Range
                <CustomSelect
                  ariaLabel="Range"
                  height={40}
                  onChange={updateQuickRange}
                  options={quickRangeOptions}
                  style={fullWidthControlStyle}
                  value={quickRange}
                />
              </label>
            ) : null}
            {reportMetadata.usesDateRange && quickRange === "custom" ? (
              <label style={controlLabelStyle}>
                Date range
                <DateRangePicker
                  label="Date range"
                  onChange={(next) => updateCustomRange({ startDate: next.from, endDate: next.to })}
                  value={{ from: range.startDate, to: range.endDate }}
                />
              </label>
            ) : null}
            {showsFocusAreaTarget ? (
              <TargetDropdown
                clearDisabled={selectedFocusAreaIds.length === 0}
                onClear={() => {
                  updateSelectedFocusAreas([]);
                }}
                summary={focusAreaSummary}
                title="Focus areas"
              >
                <div style={targetListStyle}>
                  {focusAreaOptions.length === 0 ? (
                    <div style={targetEmptyStyle}>No focus areas</div>
                  ) : (
                    focusAreaOptions.map((option) => {
                      const id = Number(option.id);
                      return (
                        <label key={option.id} style={targetCheckStyle}>
                          <input
                            checked={selectedFocusAreaIds.includes(id)}
                            onChange={(event) => {
                              const nextFocusAreaIds = event.target.checked
                                ? [...selectedFocusAreaIds, id]
                                : selectedFocusAreaIds.filter((value) => value !== id);
                              updateSelectedFocusAreas(nextFocusAreaIds);
                            }}
                            type="checkbox"
                          />
                          {option.label}
                        </label>
                      );
                    })
                  )}
                </div>
              </TargetDropdown>
            ) : null}
            {showsPeopleTarget ? (
              <TargetDropdown
                clearDisabled={selectedEmployeeIds.length === 0}
                onClear={() => {
                  setSelectedEmployeeIds([]);
                  resetAppliedReport();
                }}
                summary={peopleSummary}
                title="People"
              >
                <div style={targetListStyle}>
                  {visibleEmployeeOptions.length === 0 ? (
                    <div style={targetEmptyStyle}>
                      {selectedFocusAreaIds.length === 0
                        ? "No staff records"
                        : "No people in selected focus areas"}
                    </div>
                  ) : (
                    visibleEmployeeOptions.map((option) => (
                      <label key={option.id} style={targetCheckStyle}>
                        <input
                          checked={selectedEmployeeIds.includes(option.id)}
                          onChange={(event) => {
                            resetAppliedReport();
                            setSelectedEmployeeIds((current) =>
                              event.target.checked
                                ? [...current, option.id]
                                : current.filter((value) => value !== option.id),
                            );
                          }}
                          type="checkbox"
                        />
                        {option.label}
                      </label>
                    ))
                  )}
                </div>
              </TargetDropdown>
            ) : null}
            {showsShiftCategoryTarget ? (
              <TargetDropdown
                clearDisabled={selectedShiftCategoryIds.length === 0}
                onClear={() => {
                  setSelectedShiftCategoryIds([]);
                  resetAppliedReport();
                }}
                summary={shiftCategorySummary}
                title="Shift categories"
              >
                <div style={targetListStyle}>
                  {shiftCategoryOptions.length === 0 ? (
                    <div style={targetEmptyStyle}>No shift categories</div>
                  ) : (
                    shiftCategoryOptions.map((option) => {
                      const id = Number(option.id);
                      return (
                        <label key={option.id} style={targetCheckStyle}>
                          <input
                            checked={selectedShiftCategoryIds.includes(id)}
                            onChange={(event) => {
                              resetAppliedReport();
                              setSelectedShiftCategoryIds((current) =>
                                event.target.checked
                                  ? [...current, id]
                                  : current.filter((value) => value !== id),
                              );
                            }}
                            type="checkbox"
                          />
                          {option.label}
                        </label>
                      );
                    })
                  )}
                </div>
              </TargetDropdown>
            ) : null}
            {showsJobTarget ? (
              <TargetDropdown
                clearDisabled={selectedJobIds.length === 0}
                onClear={() => {
                  setSelectedJobIds([]);
                  resetAppliedReport();
                }}
                summary={jobsSummary}
                title="Jobs"
              >
                <div style={targetListStyle}>
                  {jobOptions.length === 0 ? (
                    <div style={targetEmptyStyle}>No jobs</div>
                  ) : (
                    jobOptions.map((option) => {
                      const id = Number(option.id);
                      return (
                        <label key={option.id} style={targetCheckStyle}>
                          <input
                            checked={selectedJobIds.includes(id)}
                            onChange={(event) => {
                              resetAppliedReport();
                              setSelectedJobIds((current) =>
                                event.target.checked
                                  ? [...current, id]
                                  : current.filter((value) => value !== id),
                              );
                            }}
                            type="checkbox"
                          />
                          {option.label}
                        </label>
                      );
                    })
                  )}
                </div>
              </TargetDropdown>
            ) : null}
            {showsIndicatorTarget ? (
              <TargetDropdown
                clearDisabled={selectedIndicatorTypeIds.length === 0}
                onClear={() => {
                  setSelectedIndicatorTypeIds([]);
                  resetAppliedReport();
                }}
                summary={indicatorSummary}
                title="Indicators"
              >
                <div style={targetListStyle}>
                  {indicatorOptions.length === 0 ? (
                    <div style={targetEmptyStyle}>No indicators</div>
                  ) : (
                    indicatorOptions.map((option) => {
                      const id = Number(option.id);
                      return (
                        <label key={option.id} style={targetCheckStyle}>
                          <input
                            checked={selectedIndicatorTypeIds.includes(id)}
                            onChange={(event) => {
                              resetAppliedReport();
                              setSelectedIndicatorTypeIds((current) =>
                                event.target.checked
                                  ? [...current, id]
                                  : current.filter((value) => value !== id),
                              );
                            }}
                            type="checkbox"
                          />
                          {option.label}
                        </label>
                      );
                    })
                  )}
                </div>
              </TargetDropdown>
            ) : null}
            {showsDatesTarget ? (
              <TargetDropdown
                clearDisabled={selectedDates.length === 0}
                onClear={() => {
                  setSelectedDates([]);
                  resetAppliedReport();
                }}
                summary={datesSummary}
                title="Dates"
              >
                <div style={targetListStyle}>
                  {dateOptions.length === 0 ? (
                    <div style={targetEmptyStyle}>No dates in this range</div>
                  ) : (
                    dateOptions.map((date) => (
                      <label key={date} style={targetCheckStyle}>
                        <input
                          checked={selectedDates.includes(date)}
                          onChange={(event) => {
                            resetAppliedReport();
                            setSelectedDates((current) =>
                              event.target.checked
                                ? [...current, date]
                                : current.filter((value) => value !== date),
                            );
                          }}
                          type="checkbox"
                        />
                        <span className="dg-tabular-nums">{formatDateLabel(date)}</span>
                      </label>
                    ))
                  )}
                </div>
              </TargetDropdown>
            ) : null}
          </div>
        </section>

        {appliedRequest && reportsQuery.error ? (
          <EmptyState
            description="Refresh the report or adjust the selected filters and try again."
            heading={formatClientErrorMessage(reportsQuery.error, "Failed to load reports")}
          />
        ) : null}

        {appliedRequest && reportsQuery.data && hasVisibleRows ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            {metrics.map((metric) => (
              <div key={metric.label} data-stat-card style={metricStyle}>
                <div style={metricLabelStyle}>{metric.label}</div>
                <div className="dg-tabular-nums" style={metricValueStyle}>
                  {metric.value}
                </div>
              </div>
            ))}
          </section>
        ) : null}

        {appliedRequest && !reportsQuery.error ? (
          <section style={hasVisibleRows ? tableShellStyle : undefined}>
            {hasVisibleRows ? (
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {preview.columns.map((column, columnIndex) => (
                        <th key={`${column.label}-${columnIndex}`} style={thStyle}>
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row, index) => (
                      <tr key={index} style={index % 2 === 1 ? stripedRowStyle : undefined}>
                        {preview.columns.map((column, columnIndex) => (
                          <td key={`${column.label}-${columnIndex}`} style={tdStyle}>
                            {formatReportCellForDisplay(row[columnIndex])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                data-testid="reports-empty-state"
                description="Try a different date range or adjust the selected filters."
                heading={preview?.emptyText ?? "Loading reports"}
                icon={<FileText size={28} />}
              />
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

// Content width is the floor; with room to spare the fields share the rest
// of the row so the toolbar spans the page.
const controlLabelStyle: CSSProperties = {
  display: "grid",
  flex: "1 1 auto",
  maxWidth: "100%",
  gap: 6,
  color: "var(--dg-type-field-title-color)",
  fontSize: "var(--dg-type-field-title-size)",
  fontWeight: "var(--dg-type-field-title-weight)",
  letterSpacing: "var(--dg-type-field-title-letter-spacing)",
  lineHeight: "var(--dg-type-field-title-line-height)",
  minWidth: 0,
};

const reportsContentStyle: CSSProperties = {
  margin: 0,
  maxWidth: "none",
  width: "100%",
};

const reportsRunActionsStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "flex-end",
  minWidth: 0,
};

const reportsSettingsStyle: CSSProperties = {
  marginBottom: 18,
};

const reportsSettingsHeaderStyle: CSSProperties = {
  marginBottom: 16,
};

const reportsSettingsDescriptionStyle: CSSProperties = {
  color: "var(--dg-color-text-muted)",
  fontSize: "var(--dg-fs-body)",
  lineHeight: 1.45,
  margin: "4px 0 0",
};

// A wrapping row where each field is at least as wide as its own value, so
// "Custom (Aug 30 - Oct 3)" and "Aug 30 - Oct 3, 2026" both show in full and
// "All jobs" does not sit in a column sized for them.
const reportsFilterControlsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  alignItems: "flex-end",
};

const fullWidthControlStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  width: "100%",
};

const metricStyle: CSSProperties = {
  border: "1px solid var(--dg-color-border)",
  borderRadius: "var(--dg-radius-md)",
  background: "var(--dg-color-surface)",
  padding: 14,
};

const metricLabelStyle: CSSProperties = {
  color: "var(--dg-color-text-muted)",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 700,
  marginBottom: 6,
};

const metricValueStyle: CSSProperties = {
  fontSize: "var(--dg-fs-title)",
  fontWeight: 700,
};

const targetDropdownButtonStyle: CSSProperties = {
  alignItems: "center",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  justifyContent: "space-between",
  minHeight: "var(--dg-toolbar-h)",
  minWidth: 0,
  padding: "0 10px 0 12px",
  textAlign: "left",
  width: "100%",
};

const targetDropdownTitleStyle: CSSProperties = {
  color: "var(--dg-color-text-primary)",
  fontSize: "var(--dg-fs-body)",
  fontWeight: 600,
};

const targetDropdownSummaryStyle: CSSProperties = {
  color: "var(--dg-color-text-secondary)",
  flex: 1,
  fontSize: "var(--dg-fs-body)",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const targetDropdownPopoverStyle: CSSProperties = {
  background: "var(--dg-color-surface)",
  border: "1px solid var(--dg-color-border)",
  borderRadius: "var(--dg-radius-md)",
  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.14)",
  maxHeight: "min(420px, calc(100vh - 80px))",
  overflowY: "auto",
  padding: 12,
  width: "min(340px, calc(100vw - 32px))",
};

const targetDropdownHeaderStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  marginBottom: 10,
};

const targetClearButtonStyle: CSSProperties = {
  height: 30,
  minHeight: 30,
  padding: "0 10px",
};

const targetListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 240,
  overflowY: "auto",
  paddingRight: 4,
};

const targetCheckStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "var(--dg-fs-body)",
};

const targetEmptyStyle: CSSProperties = {
  color: "var(--dg-color-text-muted)",
  fontSize: "var(--dg-fs-caption)",
};

const tableShellStyle: CSSProperties = {
  border: "1px solid var(--dg-color-border)",
  borderRadius: "var(--dg-radius-md)",
  background: "var(--dg-color-surface)",
  overflow: "hidden",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "var(--dg-fs-body)",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "12px 14px",
  borderBottom: "1px solid var(--dg-color-border)",
  color: "var(--dg-type-table-heading-color)",
  fontSize: "var(--dg-type-table-heading-size)",
  fontWeight: "var(--dg-type-table-heading-weight)",
  letterSpacing: "var(--dg-type-table-heading-letter-spacing)",
  lineHeight: "var(--dg-type-table-heading-line-height)",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--dg-color-border-subtle)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const stripedRowStyle: CSSProperties = {
  background: "var(--dg-color-bg-secondary)",
};

export function ReportsPageContent() {
  return (
    <ProtectedRoute>
      <SetupGuard>
        <ReportsContent />
      </SetupGuard>
    </ProtectedRoute>
  );
}

export default ReportsPageContent;
