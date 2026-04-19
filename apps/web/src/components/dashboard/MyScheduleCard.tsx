import { formatDateKey } from "@/lib/dashboard-stats";
import type { ShiftMap, ShiftCode, Employee, AbsenceType } from "@/types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface MyScheduleCardProps {
  currentEmpId: string | null;
  employee: Employee | undefined;
  periodDates: Date[];
  shifts: ShiftMap;
  shiftCodeById: Map<number, ShiftCode>;
  absenceTypeById: Map<number, AbsenceType>;
}

export default function MyScheduleCard({
  currentEmpId,
  employee,
  periodDates,
  shifts,
  shiftCodeById,
  absenceTypeById,
}: MyScheduleCardProps) {
  const todayKey = formatDateKey(new Date());

  if (!currentEmpId || !employee) {
    return (
      <div className="dg-card">
        <div className="dg-card-header">
          <div className="dg-card-title">My Schedule</div>
        </div>
        <div className="dg-card-body" style={{ textAlign: "center", padding: "28px 18px" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-subtle)" }}>
            Your account is not linked to an employee record.
          </div>
          <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 4 }}>
            Contact your administrator to link your account.
          </div>
        </div>
      </div>
    );
  }

  const dates = periodDates.slice(0, 14);
  const weeks = [dates.slice(0, 7)];
  if (dates.length > 7) weeks.push(dates.slice(7));

  return (
    <div className="dg-card">
      <div className="dg-card-header">
        <div>
          <div className="dg-card-title">My Schedule</div>
          <div className="dg-card-subtitle">
            {employee.firstName} {employee.lastName}
          </div>
        </div>
      </div>

      <div style={{ padding: "16px" }}>
        {weeks.map((week, wi) => (
          <div
            key={wi}
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${Math.min(week.length, 7)}, 1fr)`,
              gap: 4,
              marginTop: wi > 0 ? 4 : 0,
            }}
          >
            {week.map((date) => {
              const dateKey = formatDateKey(date);
              const isToday = dateKey === todayKey;
              const entry = shifts[`${currentEmpId}_${dateKey}`];

              // Resolve shift codes
              const codes = entry?.shiftCodeIds
                ?.map((id) => shiftCodeById.get(id))
                .filter(Boolean) as ShiftCode[] | undefined;

              // Resolve absence type
              const absenceId = entry?.absenceTypeId;
              const absence = absenceId != null ? absenceTypeById.get(absenceId) : undefined;

              const hasShift = (codes && codes.length > 0) || absence;

              return (
                <div
                  key={dateKey}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    padding: "12px 8px",
                    borderRadius: "var(--dg-radius-md)",
                    background: isToday ? "var(--color-brand-bg)" : "var(--color-bg)",
                    border: isToday ? "1px solid var(--color-brand-border, var(--color-border))" : "1px solid var(--color-border-light)",
                  }}
                >
                  {/* Day name */}
                  <span style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: isToday ? "var(--color-primary)" : "var(--color-text-faint)",
                    letterSpacing: "0.02em",
                  }}>
                    {DAY_NAMES[date.getDay()]}
                  </span>

                  {/* Date number */}
                  <span style={{
                    fontSize: 15,
                    fontWeight: isToday ? 700 : 600,
                    color: isToday ? "var(--color-primary)" : "var(--color-text-primary)",
                    lineHeight: 1,
                  }}>
                    {date.getDate()}
                  </span>

                  {/* Shift pill(s) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%", marginTop: 2 }}>
                    {codes && codes.length > 0 ? (
                      codes.map((sc) => (
                        <div
                          key={sc.id}
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "3px 4px",
                            borderRadius: 5,
                            background: sc.color,
                            color: sc.text,
                            border: `1px solid ${sc.border}`,
                            textAlign: "center",
                            lineHeight: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {sc.label}
                        </div>
                      ))
                    ) : absence ? (
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "3px 4px",
                          borderRadius: 5,
                          background: absence.color,
                          color: absence.text,
                          border: `1px solid ${absence.border}`,
                          textAlign: "center",
                          lineHeight: 1,
                        }}
                      >
                        {absence.label}
                      </div>
                    ) : (
                      <div style={{
                        fontSize: 10,
                        padding: "3px 4px",
                        borderRadius: 5,
                        background: hasShift ? "var(--color-bg-secondary)" : "transparent",
                        color: "var(--color-text-faint)",
                        textAlign: "center",
                        lineHeight: 1,
                      }}>
                        {entry?.label || "\u00B7"}
                      </div>
                    )}
                    {/* Shift time range */}
                    {hasShift && entry?.customStartTime && entry?.customEndTime && (
                      <div style={{
                        fontSize: 8,
                        color: isToday ? "var(--color-primary)" : "var(--color-text-faint)",
                        textAlign: "center",
                        lineHeight: 1,
                        marginTop: 1,
                      }}>
                        {entry.customStartTime.slice(0, 5)}&ndash;{entry.customEndTime.slice(0, 5)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
