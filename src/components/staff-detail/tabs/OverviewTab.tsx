"use client";

import type {
  Employee,
  FocusArea,
  NamedItem,
  Organization,
  RecurringShift,
  ShiftMap,
  ShiftCode,
  ShiftCategory,
} from "@/types";
import type { EmployeeHours } from "@/lib/dashboard-stats";
import { getCertName } from "@/lib/utils";
import { sectionStyle, sectionHeaderStyle, sectionBodyStyle, thStyle, tdStyle, labelStyle } from "@/lib/styles";
import { DAY_LABELS } from "@/lib/constants";

interface OverviewTabProps {
  employee: Employee;
  focusAreas: FocusArea[];
  certifications: NamedItem[];
  orgRoles: NamedItem[];
  org: Organization;
  recurringShifts: RecurringShift[];
  shifts: ShiftMap;
  shiftCodeById: Map<number, ShiftCode>;
  categoryById: Map<number, ShiftCategory>;
  focusAreaById: Map<number, FocusArea>;
  thisWeekHours: EmployeeHours | null;
}

export function OverviewTab({
  employee,
  focusAreas,
  certifications,
  orgRoles,
  org,
  recurringShifts,
  thisWeekHours,
}: OverviewTabProps) {
  const certName = getCertName(employee.certificationId, certifications);
  const roleNames = employee.roleIds
    .map(id => orgRoles.find(r => r.id === id)?.name)
    .filter(Boolean);
  const faNames = employee.focusAreaIds
    .map(id => focusAreas.find(fa => fa.id === id))
    .filter(Boolean);

  const statusDays = employee.statusChangedAt
    ? Math.floor((Date.now() - new Date(employee.statusChangedAt).getTime()) / 86400000)
    : null;

  const shiftCount = thisWeekHours
    ? Object.values(thisWeekHours.dailyHours).filter(h => h > 0).length
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Row 1: Stat Cards (3-col) ──────────────────────── */}
      <div className="staff-grid-3">
        <StatWidget
          label="Hours"
          value={thisWeekHours ? `${thisWeekHours.totalHours}h` : "—"}
          dotColor={thisWeekHours?.isOvertime ? "var(--color-danger)" : "var(--color-success)"}
          progress={thisWeekHours ? Math.min((thisWeekHours.totalHours / 40) * 100, 100) : 0}
          progressColor={thisWeekHours?.isOvertime ? "var(--color-danger)" : "var(--color-success)"}
          subtext="of 40h limit"
        />
        <StatWidget
          label="Shifts"
          value={String(shiftCount)}
          dotColor="var(--color-info)"
          progress={Math.min((shiftCount / 5) * 100, 100)}
          progressColor="var(--color-info)"
          subtext="days this week"
        />
        <StatWidget
          label="Overtime"
          value={thisWeekHours?.isOvertime ? `+${thisWeekHours.overtimeHours}h` : "None"}
          dotColor={thisWeekHours?.isOvertime ? "var(--color-danger)" : "var(--color-border)"}
          progress={thisWeekHours?.isOvertime ? Math.min((thisWeekHours.overtimeHours / 10) * 100, 100) : 0}
          progressColor="var(--color-danger)"
          subtext="overtime this week"
        />
      </div>

      {/* ── Row 2: Two equal columns ───────────────────────── */}
      <div className="staff-grid-2">
        {/* At a Glance */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>At a Glance</div>
          <div style={sectionBodyStyle}>
            {/* Status */}
            <InfoRow
              label="Status"
              value={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: employee.status === "active" ? "var(--color-success)" : employee.status === "benched" ? "var(--color-warning)" : "var(--color-danger)",
                    flexShrink: 0,
                  }} />
                  {employee.status.charAt(0).toUpperCase() + employee.status.slice(1)}
                  {statusDays !== null && (
                    <span style={{ color: "var(--color-text-faint)", fontWeight: 400 }}>
                      ({statusDays}d)
                    </span>
                  )}
                </span>
              }
            />

            {/* Focus areas */}
            <InfoRow
              label={org.focusAreaLabel}
              value={
                faNames.length > 0 ? (
                  <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {faNames.map(fa => fa && (
                      <span
                        key={fa.id}
                        style={{
                          background: fa.colorBg,
                          color: fa.colorText,
                          fontSize: "var(--dg-fs-badge)",
                          fontWeight: 600,
                          borderRadius: 20,
                          padding: "2px 8px",
                        }}
                      >
                        {fa.name}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span style={{ color: "var(--color-text-faint)" }}>None</span>
                )
              }
            />

            {/* Certification */}
            <InfoRow
              label={org.certificationLabel}
              value={
                certName
                  ? <span>{certName}</span>
                  : <span style={{ color: "var(--color-text-faint)" }}>None</span>
              }
            />

            {/* Roles */}
            <InfoRow
              label={org.roleLabel}
              value={
                roleNames.length > 0
                  ? <span>{roleNames.join(", ")}</span>
                  : <span style={{ color: "var(--color-text-faint)" }}>None</span>
              }
            />

            {/* Status note */}
            {employee.statusNote && (
              <InfoRow label="Status Note" value={<span style={{ fontStyle: "italic" }}>{employee.statusNote}</span>} />
            )}

            {/* Contact notes */}
            {employee.contactNotes && (
              <InfoRow label="Notes" value={<span>{employee.contactNotes}</span>} />
            )}
          </div>
        </div>

        {/* Recurring Schedule */}
        <div style={sectionStyle}>
          <div style={sectionHeaderStyle}>
            Recurring Schedule
            <span style={{ fontWeight: 500, color: "var(--color-text-faint)", marginLeft: 8, fontSize: "var(--dg-fs-caption)" }}>
              {recurringShifts.length} template{recurringShifts.length !== 1 ? "s" : ""}
            </span>
          </div>
          {recurringShifts.length === 0 ? (
            <div style={{
              ...sectionBodyStyle,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 100,
              color: "var(--color-text-faint)",
              fontSize: "var(--dg-fs-caption)",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8, opacity: 0.4 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              No recurring shifts configured
            </div>
          ) : (
            <>
              {/* Weekly visual pattern */}
              <div style={{ padding: "16px 20px", display: "flex", gap: 4 }}>
                {DAY_LABELS.map((day, i) => {
                  const rs = recurringShifts.find(r => r.dayOfWeek === i);
                  return (
                    <div
                      key={day}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "8px 4px",
                        borderRadius: 8,
                        background: rs ? "var(--color-info-bg)" : "var(--color-bg-secondary)",
                        border: rs ? "1px solid var(--color-info-border)" : "1px solid var(--color-border-light)",
                      }}
                    >
                      <div style={{ fontSize: "var(--dg-fs-badge)", fontWeight: 700, color: "var(--color-text-muted)" }}>{day}</div>
                      {rs && (
                        <div style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 700, color: "var(--color-info-text)", marginTop: 2 }}>
                          {rs.shiftLabel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Day</th>
                    <th style={thStyle}>Shift</th>
                    <th style={thStyle}>From</th>
                    <th style={thStyle}>Until</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringShifts.map((rs) => (
                    <tr key={rs.id} className="dg-table-row">
                      <td style={tdStyle}>{DAY_LABELS[rs.dayOfWeek]}</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{rs.shiftLabel}</td>
                      <td style={tdStyle}>{rs.effectiveFrom}</td>
                      <td style={{ ...tdStyle, color: rs.effectiveUntil ? "var(--color-text-primary)" : "var(--color-text-faint)" }}>
                        {rs.effectiveUntil ?? "Ongoing"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Local Components ───────────────────────────────────── */

function StatWidget({
  label,
  value,
  dotColor,
  progress,
  progressColor,
  subtext,
}: {
  label: string;
  value: string;
  dotColor: string;
  progress: number;
  progressColor: string;
  subtext: string;
}) {
  return (
    <div className="staff-stat">
      <div style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-subtle)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: dotColor === "var(--color-danger)" ? "var(--color-danger)" : "var(--color-text-primary)", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ height: 4, background: "var(--color-border)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: 4, borderRadius: 2, width: `${Math.min(100, Math.max(0, progress))}%`, background: progressColor, transition: "width 0.4s ease" }} />
      </div>
      <div style={{ fontSize: "var(--dg-fs-footnote)", color: "var(--color-text-subtle)" }}>
        {subtext}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-border-light)" }}>
      <span style={{ fontSize: "var(--dg-fs-caption)", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--dg-fs-body-sm)", color: "var(--color-text-primary)", fontWeight: 500, textAlign: "right", maxWidth: "65%", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}
