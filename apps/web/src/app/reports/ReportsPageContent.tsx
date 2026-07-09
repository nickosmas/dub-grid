"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileUp,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import CustomSelect, { type SelectOption } from "@/components/CustomSelect";
import ProgressBar from "@/components/ProgressBar";
import { ProtectedRoute } from "@/components/RouteGuards";
import SetupGuard from "@/components/SetupGuard";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { useOrganizationData, usePermissions } from "@/hooks";
import { formatClientErrorMessage } from "@/lib/client-facing";
import { queryKeys } from "@/lib/query-keys";
import {
  REPORT_OPTIONS,
  exportOperationsReportCsv,
  exportOperationsReportPdf,
  fetchOperationsReport,
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
type ReportTargetControl = "people" | "focusAreas";
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
    targetControls: ["people", "focusAreas"],
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
    targetControls: ["people", "focusAreas"],
  },
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

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

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function getMonthStart(date: string | null | undefined): Date {
  const parsed = date ? parseIsoDate(date) : null;
  const source = parsed ?? new Date();
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1));
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

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function compareIsoDates(left: string, right: string): number {
  return left.localeCompare(right);
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

function buildCalendarDates(month: Date): Array<{ date: string; inMonth: boolean }> {
  const firstOfMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const gridStart = addDays(firstOfMonth, -firstOfMonth.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date: toIsoDate(date),
      inMonth: date.getUTCMonth() === month.getUTCMonth(),
    };
  });
}

function CalendarGrid({
  max,
  min,
  onSelectDate,
  pendingStartDate,
  rangeEndDate,
  rangeStartDate,
  selectedDates,
  value,
}: {
  min?: string;
  max?: string;
  pendingStartDate?: string | null;
  rangeStartDate?: string;
  rangeEndDate?: string;
  selectedDates?: string[];
  value?: string;
  onSelectDate: (date: string) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getMonthStart(value ?? selectedDates?.[0] ?? rangeStartDate ?? min),
  );
  const selectedDateSet = useMemo(() => new Set(selectedDates ?? []), [selectedDates]);
  const dates = useMemo(() => buildCalendarDates(visibleMonth), [visibleMonth]);

  return (
    <div style={calendarShellStyle}>
      <div style={calendarHeaderStyle}>
        <button
          aria-label="Previous month"
          className="dg-btn dg-btn-secondary"
          onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
          style={calendarNavButtonStyle}
          type="button"
        >
          <ChevronLeft size={15} />
        </button>
        <div style={calendarMonthLabelStyle}>{formatMonthLabel(visibleMonth)}</div>
        <button
          aria-label="Next month"
          className="dg-btn dg-btn-secondary"
          onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
          style={calendarNavButtonStyle}
          type="button"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div style={calendarWeekdayGridStyle} aria-hidden="true">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day}>{day}</div>
        ))}
      </div>
      <div style={calendarGridStyle}>
        {dates.map(({ date, inMonth }) => {
          const disabled =
            (min != null && compareIsoDates(date, min) < 0) ||
            (max != null && compareIsoDates(date, max) > 0);
          const isRangeEndpoint =
            date === rangeStartDate || date === rangeEndDate || date === pendingStartDate;
          const isInRange =
            rangeStartDate != null &&
            rangeEndDate != null &&
            compareIsoDates(date, rangeStartDate) > 0 &&
            compareIsoDates(date, rangeEndDate) < 0;
          const isSelected = value === date || selectedDateSet.has(date) || isRangeEndpoint;
          const dayNumber = parseIsoDate(date)?.getUTCDate() ?? date.slice(-2);
          return (
            <button
              key={date}
              aria-label={formatDateLabel(date)}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onSelectDate(date)}
              style={{
                ...calendarDayStyle,
                ...(isInRange ? calendarDayInRangeStyle : null),
                ...(isSelected ? calendarDaySelectedStyle : null),
                ...(!inMonth ? calendarDayMutedStyle : null),
                ...(disabled ? calendarDayDisabledStyle : null),
              }}
              type="button"
            >
              {dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReportRangePicker({
  label,
  onChange,
  value,
}: {
  label: string;
  value: OperationsReportRange;
  onChange: (range: OperationsReportRange) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState<string | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const rangeLabel = `${formatDateLabel(value.startDate)} - ${formatDateLabel(value.endDate)}`;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setPendingStartDate(null);
    }
  };

  const handleSelectDate = (date: string) => {
    if (pendingStartDate == null) {
      setPendingStartDate(date);
      return;
    }
    const [startDate, endDate] =
      compareIsoDates(pendingStartDate, date) <= 0
        ? [pendingStartDate, date]
        : [date, pendingStartDate];
    onChange({ startDate, endDate });
    handleOpenChange(false);
  };

  return (
    <label style={controlLabelStyle}>
      {label}
      <button
        ref={anchorRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className="dg-input"
        onClick={() => setOpen((current) => !current)}
        style={datePickerButtonStyle}
        type="button"
      >
        <span style={datePickerLabelStyle}>{rangeLabel}</span>
        <CalendarDays size={16} style={{ flexShrink: 0 }} />
      </button>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverContent
          anchor={anchorRef}
          align="start"
          className="dg-menu"
          collisionPadding={12}
          positionMethod="fixed"
          side="bottom"
          sideOffset={6}
          style={calendarPopoverStyle}
        >
          <div style={calendarInstructionStyle}>
            {pendingStartDate == null
              ? "Select start date"
              : `Select end date for ${formatDateLabel(pendingStartDate)}`}
          </div>
          <CalendarGrid
            onSelectDate={handleSelectDate}
            pendingStartDate={pendingStartDate}
            rangeEndDate={pendingStartDate == null ? value.endDate : undefined}
            rangeStartDate={pendingStartDate ?? value.startDate}
          />
        </PopoverContent>
      </Popover>
    </label>
  );
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
      <button
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
            color: "var(--color-text-faint)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        />
      </button>
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
              <button
                className="dg-btn dg-btn-secondary"
                disabled={clearDisabled}
                onClick={onClear}
                style={targetClearButtonStyle}
                type="button"
              >
                Clear
              </button>
            </div>
          ) : null}
          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReportsContent() {
  const router = useRouter();
  const permissions = usePermissions();
  const { org, loading: orgLoading } = useOrganizationData({
    includeAssignmentDefinitionCompatibility: false,
  });
  const canAccessReports =
    !permissions.isUserViewActive &&
    (permissions.role === "admin" || permissions.isSuperAdmin === true);
  const orgId = permissions.orgId ?? org?.id ?? null;
  const [report, setReport] = useState<OperationsReportType>("staff-hours");
  const [quickRange, setQuickRange] = useState<QuickRange>("current-week");
  const [range, setRange] = useState<OperationsReportRange>(() => getDefaultRange());
  const [customRangeSelected, setCustomRangeSelected] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [selectedFocusAreaIds, setSelectedFocusAreaIds] = useState<number[]>([]);
  const [appliedRequest, setAppliedRequest] = useState<{
    range: OperationsReportRange;
    filters: OperationsReportFilters;
    filtersKey: string;
  } | null>(null);
  const [exportingFormat, setExportingFormat] = useState<"csv" | "pdf" | null>(null);
  const reportMetadata = REPORT_UI_METADATA[report];
  const showsPeopleTarget = reportMetadata.targetControls.includes("people");
  const showsFocusAreaTarget = reportMetadata.targetControls.includes("focusAreas");
  const reportFilters = useMemo<OperationsReportFilters>(
    () => ({
      employeeIds: showsPeopleTarget ? selectedEmployeeIds : [],
      focusAreaIds: showsFocusAreaTarget ? selectedFocusAreaIds : [],
      dates: [],
    }),
    [selectedEmployeeIds, selectedFocusAreaIds, showsFocusAreaTarget, showsPeopleTarget],
  );
  const filtersKey = useMemo(() => serializeFilters(reportFilters), [reportFilters]);
  const emptyFiltersKey = useMemo(() => serializeFilters(EMPTY_REPORT_FILTERS), []);
  const reportOptions = REPORT_OPTIONS as SelectOption<OperationsReportType>[];
  const quickRangeOptions = useMemo(
    () => buildQuickRangeOptions(range, org?.payPeriodStartDate, customRangeSelected),
    [customRangeSelected, org?.payPeriodStartDate, range],
  );

  useEffect(() => {
    if (!permissions.isLoading && !canAccessReports) {
      toast.info("Reports are available to admins and super admins.");
      router.replace("/dashboard");
    }
  }, [canAccessReports, permissions.isLoading, router]);

  const resetAppliedReport = () => {
    setAppliedRequest(null);
  };

  const updateRange = (nextRange: OperationsReportRange) => {
    setRange(nextRange);
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
    resetAppliedReport();
  };

  const targetOptionsQuery = useQuery({
    queryKey: orgId
      ? queryKeys.reports.operations(orgId, range.startDate, range.endDate, emptyFiltersKey)
      : ["reports", "operations", "none"],
    queryFn: () => fetchOperationsReport({ orgId: orgId!, range, filters: EMPTY_REPORT_FILTERS }),
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
  const hasExportableRows = visibleRows.length > 0;
  const isLoading =
    permissions.isLoading || orgLoading || reportsQuery.isLoading || targetOptionsQuery.isLoading;
  const optionsPayload = targetOptionsQuery.data ?? reportsQuery.data;
  const employeeOptions = optionsPayload?.filterOptions.employees ?? [];
  const focusAreaOptions = optionsPayload?.filterOptions.focusAreas ?? [];
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
        minHeight: "calc(100vh - var(--app-shell-header-h, 56px))",
        background: "var(--color-bg)",
        color: "var(--color-text-primary)",
        padding: "28px clamp(16px, 3vw, 32px)",
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
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                color: "var(--color-text-primary)",
                fontSize: "var(--dg-fs-page-title)",
                fontWeight: 800,
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
            }}
          >
            <button
              className="dg-btn dg-btn-secondary"
              disabled={
                !appliedRequest ||
                !reportsQuery.data ||
                !hasExportableRows ||
                exportingFormat != null
              }
              onClick={() => void handleExport("pdf")}
              type="button"
            >
              <FileUp size={16} />
              {exportingFormat === "pdf" ? "Exporting" : "Export PDF"}
            </button>
            <button
              className="dg-btn dg-btn-primary"
              disabled={
                !appliedRequest ||
                !reportsQuery.data ||
                !hasExportableRows ||
                exportingFormat != null
              }
              onClick={() => void handleExport("csv")}
              type="button"
            >
              <Upload size={16} />
              {exportingFormat === "csv" ? "Exporting" : "Export CSV"}
            </button>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
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
            <ReportRangePicker label="Date range" onChange={updateCustomRange} value={range} />
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
          <div data-testid="reports-run-actions" style={reportsRunActionsStyle}>
            <button
              className="dg-btn dg-btn-secondary"
              disabled={!appliedRequest}
              onClick={() => void reportsQuery.refetch()}
              type="button"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            <button
              className="dg-btn dg-btn-secondary"
              disabled={!appliedRequest}
              onClick={resetAppliedReport}
              type="button"
            >
              <X size={16} />
              Close
            </button>
            <button className="dg-btn dg-btn-primary" onClick={handleGenerateReport} type="button">
              Generate report
            </button>
          </div>
        </section>

        {appliedRequest && reportsQuery.error ? (
          <div style={emptyStateStyle}>
            {formatClientErrorMessage(reportsQuery.error, "Failed to load reports")}
          </div>
        ) : null}

        {appliedRequest && reportsQuery.data ? (
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 18,
            }}
          >
            {metrics.map((metric) => (
              <div key={metric.label} style={metricStyle}>
                <div style={metricLabelStyle}>{metric.label}</div>
                <div style={metricValueStyle}>{metric.value}</div>
              </div>
            ))}
          </section>
        ) : null}

        {appliedRequest ? (
          <section style={tableShellStyle}>
            {preview && visibleRows.length > 0 ? (
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
              <div style={emptyStateStyle}>{preview?.emptyText ?? "Loading reports"}</div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}

const controlLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-label)",
  fontWeight: 700,
  minWidth: 0,
};

const reportsContentStyle: CSSProperties = {
  margin: 0,
  maxWidth: "none",
  width: "100%",
};

const reportsRunActionsStyle: CSSProperties = {
  alignItems: "end",
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  justifyContent: "flex-start",
  justifySelf: "start",
  minWidth: 0,
};

const fullWidthControlStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  width: "100%",
};

const datePickerButtonStyle: CSSProperties = {
  alignItems: "center",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  gap: 8,
  justifyContent: "space-between",
  minHeight: 40,
  minWidth: 0,
  padding: "0 10px 0 12px",
  textAlign: "left",
  width: "100%",
};

const datePickerLabelStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const calendarPopoverStyle: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
  padding: 12,
  width: 292,
};

const calendarShellStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const calendarHeaderStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
};

const calendarNavButtonStyle: CSSProperties = {
  height: 32,
  minHeight: 32,
  padding: 0,
  width: 32,
};

const calendarMonthLabelStyle: CSSProperties = {
  color: "var(--color-text-primary)",
  flex: 1,
  fontSize: "var(--dg-fs-body)",
  fontWeight: 800,
  textAlign: "center",
};

const calendarInstructionStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 800,
  marginBottom: 10,
};

const calendarWeekdayGridStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  display: "grid",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 800,
  gap: 4,
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
  textAlign: "center",
};

const calendarGridStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
};

const calendarDayStyle: CSSProperties = {
  alignItems: "center",
  background: "transparent",
  borderColor: "transparent",
  borderRadius: 8,
  borderStyle: "solid",
  borderWidth: 1,
  color: "var(--color-text-primary)",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  fontSize: "var(--dg-fs-body)",
  fontWeight: 700,
  height: 34,
  justifyContent: "center",
};

const calendarDaySelectedStyle: CSSProperties = {
  background: "var(--color-brand-bg)",
  borderColor: "var(--color-brand-border)",
  color: "var(--color-brand)",
};

const calendarDayInRangeStyle: CSSProperties = {
  background: "color-mix(in srgb, var(--color-brand-bg) 68%, transparent)",
  borderColor: "transparent",
  color: "var(--color-brand)",
};

const calendarDayMutedStyle: CSSProperties = {
  color: "var(--color-text-subtle)",
};

const calendarDayDisabledStyle: CSSProperties = {
  cursor: "not-allowed",
  opacity: 0.35,
};

const metricStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
  padding: 14,
};

const metricLabelStyle: CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 700,
  marginBottom: 6,
};

const metricValueStyle: CSSProperties = {
  fontSize: "var(--dg-fs-title)",
  fontWeight: 800,
};

const targetDropdownButtonStyle: CSSProperties = {
  alignItems: "center",
  cursor: "pointer",
  display: "flex",
  fontFamily: "inherit",
  justifyContent: "space-between",
  minHeight: 40,
  minWidth: 0,
  padding: "0 10px 0 12px",
  textAlign: "left",
  width: "100%",
};

const targetDropdownTitleStyle: CSSProperties = {
  color: "var(--color-text-primary)",
  fontSize: "var(--dg-fs-body)",
  fontWeight: 800,
};

const targetDropdownSummaryStyle: CSSProperties = {
  color: "var(--color-text-secondary)",
  flex: 1,
  fontSize: "var(--dg-fs-body)",
  fontWeight: 500,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const targetDropdownPopoverStyle: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.14)",
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
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-caption)",
};

const tableShellStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  background: "var(--color-surface)",
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
  borderBottom: "1px solid var(--color-border)",
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-caption)",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid var(--color-border-subtle)",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const stripedRowStyle: CSSProperties = {
  background: "var(--color-bg-secondary)",
};

const emptyStateStyle: CSSProperties = {
  minHeight: 180,
  display: "grid",
  placeItems: "center",
  color: "var(--color-text-muted)",
  fontSize: "var(--dg-fs-body)",
  padding: 24,
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
