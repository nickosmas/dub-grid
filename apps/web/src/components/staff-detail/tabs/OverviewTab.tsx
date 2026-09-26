"use client";

import { type ReactNode, useMemo } from "react";
import type {
  Employee,
  ShiftMap,
  AssignmentDefinition,
  ShiftCategory,
  NamedItem,
  FocusArea,
} from "@/types";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { useTheme } from "next-themes";
import { AlertTriangle, CalendarDays, Clock, Layers, TrendingUp, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { toDarkPillColors } from "@/lib/colors";
import { SINGLE_SHIFT_PILL_RADIUS } from "@/components/schedule-grid/gridHelpers";
import {
  computeEmployeeHoursHistory,
  computeShiftDistribution,
  computeOvertimeSummary,
} from "@/lib/staff-detail-stats";
import {
  getProfileOverviewDateRange,
  PROFILE_OVERVIEW_WEEK_COUNT,
} from "@/features/account/shared/profile-schedule";

const WEEK_COUNT = PROFILE_OVERVIEW_WEEK_COUNT;

interface OverviewTabProps {
  employee: Employee;
  shifts: ShiftMap;
  assignmentById: Map<number, AssignmentDefinition>;
  categoryById: Map<number, ShiftCategory>;
  focusAreas: FocusArea[];
  focusAreaLabel?: string;
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  thisWeekHours: EmployeeHours | null;
  scheduleOverview?: ReactNode;
  timeZone?: string | null;
}

export function OverviewTab({
  employee,
  shifts,
  assignmentById,
  categoryById,
  focusAreas,
  focusAreaLabel = "Focus Areas",
  certifications,
  orgRoles,
  thisWeekHours,
  scheduleOverview,
  timeZone,
}: OverviewTabProps) {
  const { resolvedTheme } = useTheme();
  const isDarkTheme = resolvedTheme === "dark";
  const overviewRange = useMemo(
    () => getProfileOverviewDateRange(new Date(), timeZone),
    [timeZone],
  );
  const hoursHistory = useMemo(
    () =>
      computeEmployeeHoursHistory(
        employee.id,
        shifts,
        assignmentById,
        WEEK_COUNT,
        40,
        categoryById,
        overviewRange.startDate,
      ),
    [employee.id, shifts, assignmentById, categoryById, overviewRange.startDate],
  );

  const shiftDistribution = useMemo(
    () =>
      computeShiftDistribution(
        employee.id,
        shifts,
        assignmentById,
        overviewRange.startDate,
        overviewRange.endDate,
      ),
    [employee.id, shifts, assignmentById, overviewRange.startDate, overviewRange.endDate],
  );

  // Assignment colors are stored as light-tuned pastels, so they need the same
  // dark remap the schedule pills get before they land on an ink-black card.
  const distributionSegments = useMemo(
    () =>
      shiftDistribution.map((item) => ({
        ...item,
        swatch: isDarkTheme ? toDarkPillColors(item.color).bg : item.color,
      })),
    [shiftDistribution, isDarkTheme],
  );

  const overtimeSummary = useMemo(() => computeOvertimeSummary(hoursHistory), [hoursHistory]);

  const totalShifts = hoursHistory.reduce((sum, week) => sum + week.shiftCount, 0);
  const averageWeeklyHours =
    hoursHistory.length > 0
      ? Math.round(
          (hoursHistory.reduce((sum, week) => sum + week.totalHours, 0) / hoursHistory.length) * 10,
        ) / 10
      : 0;

  const totalDistributionShifts = shiftDistribution.reduce((sum, item) => sum + item.count, 0);

  const certificationName = employee.certificationId
    ? certifications.find((item) => item.id === employee.certificationId)?.name
    : null;
  const employmentLabel = employee.employmentType === "part_time" ? "Part-time" : "Full-time";
  const assignedFocusAreaNames = employee.focusAreaIds
    .map((id) => focusAreas.find((item) => item.id === id)?.name)
    .filter(Boolean) as string[];
  const roleNames = employee.roleIds
    .map((id) => orgRoles.find((role) => role.id === id)?.name)
    .filter(Boolean) as string[];
  const hasDetails =
    !!employmentLabel ||
    assignedFocusAreaNames.length > 0 ||
    !!certificationName ||
    roleNames.length > 0 ||
    !!employee.contactNotes;

  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="overview-summary"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <MetricCard
          label="This Week"
          value={thisWeekHours ? `${thisWeekHours.totalHours}h` : "—"}
          detail={
            thisWeekHours?.isOvertime
              ? `+${thisWeekHours.overtimeHours}h overtime`
              : thisWeekHours && thisWeekHours.totalHours > 0
                ? "No overtime this week"
                : "No scheduled hours yet"
          }
          icon={Clock}
          tone={thisWeekHours?.isOvertime ? "warning" : "brand"}
          danger={thisWeekHours?.isOvertime}
        />
        <MetricCard label="Avg / Week" value={`${averageWeeklyHours}h`} icon={TrendingUp} />
        <MetricCard
          label={`Shifts (${WEEK_COUNT}wk)`}
          value={String(totalShifts)}
          icon={CalendarDays}
        />
        <MetricCard
          label="OT Weeks"
          value={String(overtimeSummary.weeksWithOT)}
          icon={AlertTriangle}
          tone={overtimeSummary.weeksWithOT > 0 ? "warning" : "neutral"}
          danger={overtimeSummary.weeksWithOT > 0}
        />
      </div>

      {scheduleOverview}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {hasDetails && (
          <div className="dg-card">
            <div className="dg-card-header">
              <div>
                <div className="dg-card-title flex items-center gap-2">
                  <User className="h-4 w-4 text-[var(--dg-color-text-muted)]" />
                  Details
                </div>
                <div className="dg-card-subtitle">
                  {`Employment, ${focusAreaLabel.toLowerCase()}, certification, roles, and internal notes.`}
                </div>
              </div>
            </div>
            <div className="dg-card-body">
              <dl className="flex flex-col gap-3">
                <div>
                  <dt className="dg-type-field-title mb-0.5">Employment</dt>
                  <dd className="text-[13px] text-[var(--dg-color-text-primary)]">
                    {employmentLabel}
                  </dd>
                </div>
                {assignedFocusAreaNames.length > 0 && (
                  <div>
                    <dt className="dg-type-field-title mb-0.5">{focusAreaLabel}</dt>
                    <dd className="text-[13px] text-[var(--dg-color-text-primary)]">
                      {assignedFocusAreaNames.join(", ")}
                    </dd>
                  </div>
                )}
                {certificationName && (
                  <div>
                    <dt className="dg-type-field-title mb-0.5">Certifications</dt>
                    <dd className="text-[13px] text-[var(--dg-color-text-primary)]">
                      {certificationName}
                    </dd>
                  </div>
                )}
                {roleNames.length > 0 && (
                  <div>
                    <dt className="dg-type-field-title mb-0.5">Roles</dt>
                    <dd className="text-[13px] text-[var(--dg-color-text-primary)]">
                      {roleNames.join(", ")}
                    </dd>
                  </div>
                )}
                {employee.contactNotes && (
                  <div>
                    <dt className="dg-type-field-title mb-0.5">Notes</dt>
                    <dd className="text-[13px] leading-relaxed text-[var(--dg-color-text-primary)]">
                      {employee.contactNotes}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        <div className={`dg-card ${!hasDetails ? "md:col-span-2" : ""}`}>
          <div className="dg-card-header">
            <div>
              <div className="dg-card-title flex items-center gap-2">
                <Layers className="h-4 w-4 text-[var(--dg-color-text-muted)]" />
                Assignments
              </div>
              <div className="dg-card-subtitle">
                Most common shift and job patterns across recent schedule history.
              </div>
            </div>
          </div>
          <div className="dg-card-body">
            {shiftDistribution.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[var(--dg-color-text-muted)]">
                No shift data available
              </div>
            ) : (
              <div>
                <div
                  className="mb-4 flex h-6 overflow-hidden bg-muted"
                  style={{
                    // Matches the schedule grid's shift pills rather than a
                    // capsule, so the two charts read as the same family.
                    borderRadius: SINGLE_SHIFT_PILL_RADIUS,
                    border: "1px solid var(--dg-color-border-strong)",
                  }}
                >
                  {distributionSegments.map((item, index) => (
                    <div
                      key={item.assignmentId}
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${totalDistributionShifts > 0 ? (item.count / totalDistributionShifts) * 100 : 0}%`,
                        backgroundColor: item.swatch,
                        // One line per seam: the outline lives on the track, and
                        // each segment but the last draws the single divider it
                        // shares with its neighbor. The seam runs a step darker
                        // than the frame because it has to separate two fills
                        // rather than sit against the card.
                        borderRight:
                          index < distributionSegments.length - 1
                            ? "1px solid var(--dg-color-text-subtle)"
                            : undefined,
                      }}
                    />
                  ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  {distributionSegments.map((item) => (
                    <div key={item.assignmentId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{
                            backgroundColor: item.swatch,
                            boxShadow: "0 0 0 0.5px var(--dg-color-border-strong)",
                          }}
                        />
                        <span className="text-[13px] font-semibold text-[var(--dg-color-text-primary)]">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[13px] text-[var(--dg-color-text-muted)]">
                        {item.count}{" "}
                        <span className="text-[var(--dg-color-text-faint)]">
                          ({item.percentage}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const METRIC_CARD_TONES = {
  brand: { badge: "var(--dg-color-brand-bg)", icon: "var(--dg-color-brand)" },
  neutral: { badge: "var(--dg-color-bg-secondary)", icon: "var(--dg-color-text-subtle)" },
  warning: { badge: "var(--dg-color-warning-bg)", icon: "var(--dg-color-warning-text)" },
} as const;

/** The directory's summary card, reused so a person reads like the roster. */
function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  danger,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  tone?: keyof typeof METRIC_CARD_TONES;
  danger?: boolean;
}) {
  const palette = METRIC_CARD_TONES[tone];
  return (
    <Card size="sm" data-stat-card className="h-full">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="dg-type-field-title truncate">{label}</p>
          <p
            className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums"
            style={{ color: danger ? "var(--dg-color-danger)" : undefined }}
          >
            {value}
          </p>
          {detail ? (
            <p className="mt-0.5 text-[length:var(--dg-type-metadata-size)] text-[var(--dg-color-text-muted)]">
              {detail}
            </p>
          ) : null}
        </div>
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: palette.badge }}
        >
          <Icon className="h-5 w-5" style={{ color: palette.icon }} />
        </div>
      </CardContent>
    </Card>
  );
}
