"use client";

import { useMemo } from "react";
import type {
  Employee,
  ShiftMap,
  ShiftCode,
  ShiftCategory,
  FocusArea,
  NamedItem,
} from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BarChart3, User, Layers } from "lucide-react";
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
  focusAreaById: Map<number, FocusArea>;
  certifications: NamedItem[];
  orgRoles: NamedItem[];
}

export function OverviewTab({
  employee,
  shifts,
  shiftCodeById,
  categoryById,
  focusAreaById,
  certifications,
  orgRoles,
}: OverviewTabProps) {
  const hoursHistory = useMemo(
    () => computeEmployeeHoursHistory(employee.id, shifts, shiftCodeById, WEEK_COUNT, 40, categoryById, focusAreaById),
    [employee.id, shifts, shiftCodeById, categoryById, focusAreaById]
  );

  const shiftDist = useMemo(
    () => computeShiftDistribution(employee.id, shifts, shiftCodeById),
    [employee.id, shifts, shiftCodeById]
  );

  const otSummary = useMemo(() => computeOvertimeSummary(hoursHistory), [hoursHistory]);

  const totalShifts = hoursHistory.reduce((s, w) => s + w.shiftCount, 0);
  const avgWeeklyHours = hoursHistory.length > 0
    ? Math.round((hoursHistory.reduce((s, w) => s + w.totalHours, 0) / hoursHistory.length) * 10) / 10
    : 0;

  const topCode = shiftDist.length > 0 ? shiftDist[0] : null;
  const totalDistShifts = shiftDist.reduce((s, d) => s + d.count, 0);

  // Profile details
  const certName = employee.certificationId
    ? certifications.find(c => c.id === employee.certificationId)?.name
    : null;
  const roleNames = employee.roleIds
    .map(id => orgRoles.find(r => r.id === id)?.name)
    .filter(Boolean) as string[];

  const hasDetails = !!certName || roleNames.length > 0 || !!employee.contactNotes;

  return (
    <div className="flex flex-col gap-4">
      {/* Metric Strip */}
      <Card className="shadow-sm">
        <CardHeader className="border-b pb-3">
          <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border">
            <MetricCell value={`${avgWeeklyHours}h`} label="Avg / Week" />
            <MetricCell value={String(totalShifts)} label={`Shifts (${WEEK_COUNT}wk)`} />
            <MetricCell
              value={String(otSummary.weeksWithOT)}
              label="OT Weeks"
              danger={otSummary.weeksWithOT > 0}
            />
            <MetricCell
              value={topCode ? topCode.label : "—"}
              label={topCode ? `${topCode.percentage}% of shifts` : "Top Code"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile Details */}
        {hasDetails && (
          <Card className="shadow-sm">
            <CardHeader className="border-b pb-3">
              <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                {certName && (
                  <div>
                    <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.05em] mb-0.5">
                      Certifications
                    </dt>
                    <dd className="text-[13px] text-foreground">{certName}</dd>
                  </div>
                )}
                {roleNames.length > 0 && (
                  <div>
                    <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.05em] mb-0.5">
                      Roles
                    </dt>
                    <dd className="text-[13px] text-foreground">{roleNames.join(", ")}</dd>
                  </div>
                )}
                {employee.contactNotes && (
                  <div>
                    <dt className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.05em] mb-0.5">
                      Notes
                    </dt>
                    <dd className="text-[13px] text-foreground leading-relaxed">{employee.contactNotes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Shift Code Distribution */}
        <Card className={`shadow-sm ${!hasDetails ? 'md:col-span-2' : ''}`}>
          <CardHeader className="border-b pb-3">
            <CardTitle className="text-[14px] font-bold text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              Shift Codes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {shiftDist.length === 0 ? (
              <div className="text-muted-foreground text-[13px] text-center py-8">
                No shift data available
              </div>
            ) : (
              <div>
                {/* Stacked bar */}
                <div className="flex h-2.5 rounded-full overflow-hidden bg-muted mb-4">
                  {shiftDist.map((d, i) => (
                    <div
                      key={d.shiftCodeId}
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${totalDistShifts > 0 ? (d.count / totalDistShifts) * 100 : 0}%`,
                        backgroundColor: d.color,
                        borderRadius: i === 0 && shiftDist.length === 1 ? "9999px" : i === 0 ? "9999px 0 0 9999px" : i === shiftDist.length - 1 ? "0 9999px 9999px 0" : "0",
                      }}
                    />
                  ))}
                </div>

                {/* Legend */}
                <div className="flex flex-col gap-2.5">
                  {shiftDist.map((d) => (
                    <div key={d.shiftCodeId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="text-[13px] font-semibold text-foreground">{d.name}</span>
                      </div>
                      <span className="text-[13px] text-muted-foreground">
                        {d.count} <span className="text-muted-foreground/60">({d.percentage}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCell({
  value,
  label,
  danger,
}: {
  value: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-4 px-3">
      <div className={`text-xl font-bold tracking-tight leading-none ${danger ? 'text-destructive' : 'text-foreground'}`}>
        {value}
      </div>
      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.04em] mt-1.5 text-center">
        {label}
      </div>
    </div>
  );
}
