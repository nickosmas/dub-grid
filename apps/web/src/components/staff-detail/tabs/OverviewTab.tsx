"use client";

import { type ReactNode, useMemo } from "react";
import type {
  Employee,
  ShiftMap,
  ShiftCode,
  ShiftCategory,
  NamedItem,
  FocusArea,
  ShiftDisplayMode,
  Invitation,
} from "@/types";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { BarChart3, User, Layers, Shield, BriefcaseBusiness } from "lucide-react";
import {
  computeEmployeeHoursHistory,
  computeShiftDistribution,
  computeOvertimeSummary,
} from "@/lib/staff-detail-stats";

const WEEK_COUNT = 12;

interface OverviewTabProps {
  employee: Employee;
  shifts: ShiftMap;
  shiftCodeById: Map<number, ShiftCode>;
  categoryById: Map<number, ShiftCategory>;
  focusAreas: FocusArea[];
  focusAreaLabel?: string;
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  pendingInvite: Invitation | null;
  thisWeekHours: EmployeeHours | null;
  shiftDisplayMode?: ShiftDisplayMode;
}

export function OverviewTab({
  employee,
  shifts,
  shiftCodeById,
  categoryById,
  focusAreas,
  focusAreaLabel = "Focus Areas",
  certifications,
  orgRoles,
  pendingInvite,
  thisWeekHours,
  shiftDisplayMode,
}: OverviewTabProps) {
  const isNameMode = shiftDisplayMode === "name";
  const hoursHistory = useMemo(
    () => computeEmployeeHoursHistory(employee.id, shifts, shiftCodeById, WEEK_COUNT, 40, categoryById),
    [employee.id, shifts, shiftCodeById, categoryById]
  );

  const shiftDistribution = useMemo(
    () => computeShiftDistribution(employee.id, shifts, shiftCodeById),
    [employee.id, shifts, shiftCodeById]
  );

  const overtimeSummary = useMemo(() => computeOvertimeSummary(hoursHistory), [hoursHistory]);

  const totalShifts = hoursHistory.reduce((sum, week) => sum + week.shiftCount, 0);
  const averageWeeklyHours = hoursHistory.length > 0
    ? Math.round((hoursHistory.reduce((sum, week) => sum + week.totalHours, 0) / hoursHistory.length) * 10) / 10
    : 0;

  const topCode = shiftDistribution.length > 0 ? shiftDistribution[0] : null;
  const totalDistributionShifts = shiftDistribution.reduce((sum, item) => sum + item.count, 0);

  const certificationName = employee.certificationId
    ? certifications.find((item) => item.id === employee.certificationId)?.name
    : null;
  const assignedFocusAreaNames = employee.focusAreaIds
    .map((id) => focusAreas.find((item) => item.id === id)?.name)
    .filter(Boolean) as string[];
  const roleNames = employee.roleIds
    .map((id) => orgRoles.find((role) => role.id === id)?.name)
    .filter(Boolean) as string[];
  const hasDetails =
    assignedFocusAreaNames.length > 0 ||
    !!certificationName ||
    roleNames.length > 0 ||
    !!employee.contactNotes;

  const accountSummary = employee.userId
    ? { label: "Linked account", detail: "Can sign in to DubGrid", dotColor: "var(--color-success)" }
    : pendingInvite
      ? { label: "Invitation pending", detail: `Sent to ${pendingInvite.email}`, dotColor: "var(--color-warning)" }
      : { label: "No account", detail: "Not invited yet", dotColor: "var(--color-text-faint)" };

  const employmentSummary = {
    label: employee.status.charAt(0).toUpperCase() + employee.status.slice(1),
    detail: employee.statusChangedAt
      ? `Since ${new Date(employee.statusChangedAt).toLocaleDateString()}`
      : employee.status === "active"
        ? "No recent status change recorded"
        : "Status change date unavailable",
    dotColor:
      employee.status === "active"
        ? "var(--color-success)"
        : employee.status === "benched"
          ? "var(--color-warning)"
          : "var(--color-danger)",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="dg-card">
        <div className="dg-card-header">
          <div>
            <div className="dg-card-title flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[var(--color-text-muted)]" />
              Summary
            </div>
            <div className="dg-card-subtitle">Hours, shift volume, and recent staffing patterns.</div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-y divide-[var(--color-border-light)] sm:grid-cols-3 lg:grid-cols-5 lg:divide-y-0 lg:divide-x lg:divide-[var(--color-border-light)]">
          <MetricCell
            value={thisWeekHours ? `${thisWeekHours.totalHours}h` : "—"}
            label="This Week"
            detail={
              thisWeekHours?.isOvertime
                ? `+${thisWeekHours.overtimeHours}h overtime`
                : thisWeekHours && thisWeekHours.totalHours > 0
                  ? "No overtime this week"
                  : "No scheduled hours yet"
            }
            danger={thisWeekHours?.isOvertime}
          />
          <MetricCell value={`${averageWeeklyHours}h`} label="Avg / Week" />
          <MetricCell value={String(totalShifts)} label={`Shifts (${WEEK_COUNT}wk)`} />
          <MetricCell
            value={String(overtimeSummary.weeksWithOT)}
            label="OT Weeks"
            danger={overtimeSummary.weeksWithOT > 0}
          />
          <MetricCell
            value={topCode ? (isNameMode ? (topCode.name || topCode.label) : topCode.label) : "—"}
            label={topCode ? `${topCode.percentage}% of shifts` : "Top Code"}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatusCard
          title="Account"
          label={accountSummary.label}
          detail={accountSummary.detail}
          icon={<Shield className="h-4 w-4 text-[var(--color-text-muted)]" />}
          dotColor={accountSummary.dotColor}
        />
        <StatusCard
          title="Employment"
          label={employmentSummary.label}
          detail={employmentSummary.detail}
          note={employee.statusNote || undefined}
          icon={<BriefcaseBusiness className="h-4 w-4 text-[var(--color-text-muted)]" />}
          dotColor={employmentSummary.dotColor}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {hasDetails && (
          <div className="dg-card">
            <div className="dg-card-header">
              <div>
                <div className="dg-card-title flex items-center gap-2">
                  <User className="h-4 w-4 text-[var(--color-text-muted)]" />
                  Details
                </div>
                <div className="dg-card-subtitle">
                  {`${focusAreaLabel}, certification, roles, and internal notes.`}
                </div>
              </div>
            </div>
            <div className="dg-card-body">
              <dl className="flex flex-col gap-3">
                {assignedFocusAreaNames.length > 0 && (
                  <div>
                    <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
                      {focusAreaLabel}
                    </dt>
                    <dd className="text-[13px] text-[var(--color-text-primary)]">
                      {assignedFocusAreaNames.join(", ")}
                    </dd>
                  </div>
                )}
                {certificationName && (
                  <div>
                    <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
                      Certifications
                    </dt>
                    <dd className="text-[13px] text-[var(--color-text-primary)]">{certificationName}</dd>
                  </div>
                )}
                {roleNames.length > 0 && (
                  <div>
                    <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
                      Roles
                    </dt>
                    <dd className="text-[13px] text-[var(--color-text-primary)]">{roleNames.join(", ")}</dd>
                  </div>
                )}
                {employee.contactNotes && (
                  <div>
                    <dt className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
                      Notes
                    </dt>
                    <dd className="text-[13px] leading-relaxed text-[var(--color-text-primary)]">{employee.contactNotes}</dd>
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
                <Layers className="h-4 w-4 text-[var(--color-text-muted)]" />
                {isNameMode ? "Shift Types" : "Shift Codes"}
              </div>
              <div className="dg-card-subtitle">Most common assignments across recent shift history.</div>
            </div>
          </div>
          <div className="dg-card-body">
            {shiftDistribution.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[var(--color-text-muted)]">
                No shift data available
              </div>
            ) : (
              <div>
                <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
                  {shiftDistribution.map((item, index) => (
                    <div
                      key={item.shiftCodeId}
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${totalDistributionShifts > 0 ? (item.count / totalDistributionShifts) * 100 : 0}%`,
                        backgroundColor: item.color,
                        borderRadius:
                          index === 0 && shiftDistribution.length === 1
                            ? "9999px"
                            : index === 0
                              ? "9999px 0 0 9999px"
                              : index === shiftDistribution.length - 1
                                ? "0 9999px 9999px 0"
                                : "0",
                      }}
                    />
                  ))}
                </div>

                <div className="flex flex-col gap-2.5">
                  {shiftDistribution.map((item) => (
                    <div key={item.shiftCodeId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[13px] text-[var(--color-text-muted)]">
                        {item.count} <span className="text-[var(--color-text-faint)]">({item.percentage}%)</span>
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

function MetricCell({
  value,
  label,
  detail,
  danger,
}: {
  value: string;
  label: string;
  detail?: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-3 py-4">
      <div
        className="text-xl font-bold leading-none tracking-tight"
        style={{ color: danger ? "var(--color-danger)" : "var(--color-text-primary)" }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-center text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-text-subtle)]">
        {label}
      </div>
      {detail ? (
        <div className="mt-1 text-center text-[11px] text-[var(--color-text-muted)]">{detail}</div>
      ) : null}
    </div>
  );
}

function StatusCard({
  title,
  label,
  detail,
  note,
  icon,
  dotColor,
}: {
  title: string;
  label: string;
  detail: string;
  note?: string;
  icon: ReactNode;
  dotColor: string;
}) {
  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title flex items-center gap-2">
            {icon}
            {title}
          </div>
        </div>
      </div>
      <div className="dg-card-body">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: dotColor }}
          />
          <div className="text-[15px] font-semibold text-[var(--color-text-primary)]">{label}</div>
        </div>
        <div className="mt-1 text-[13px] text-[var(--color-text-muted)]">{detail}</div>
        {note ? (
          <div className="mt-3 rounded-lg bg-[var(--color-bg)] px-3 py-2 text-[12px] italic text-[var(--color-text-muted)]">
            {note}
          </div>
        ) : null}
      </div>
    </div>
  );
}
