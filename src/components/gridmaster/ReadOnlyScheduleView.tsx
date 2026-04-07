"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { sectionStyle, thStyle, tdStyle } from "@/lib/styles";
import { EmptyState } from "@/components/EmptyState";

interface ShiftRow {
  empId: string;
  empName: string;
  date: string;
  shiftCodes: string[];
  absenceLabel: string | null;
  focusAreaName: string | null;
  isDraft: boolean;
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function ReadOnlyScheduleView({ orgId }: { orgId: string }) {
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek + weekOffset * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 13); // 2 weeks
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [weekOffset]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        // Fetch shifts with employee and shift code names
        const { data: shiftData, error: shiftErr } = await supabase
          .from("shifts")
          .select(`
            emp_id,
            date,
            draft_shift_code_ids,
            published_shift_code_ids,
            draft_absence_type_id,
            published_absence_type_id,
            draft_is_delete,
            focus_area_id,
            employees(first_name, last_name),
            focus_areas(name)
          `)
          .eq("org_id", orgId)
          .gte("date", startDate)
          .lte("date", endDate)
          .order("date")
          .order("emp_id");

        if (shiftErr) throw shiftErr;
        if (cancelled) return;

        // Fetch shift code labels for this org
        const { data: codes } = await supabase
          .from("shift_codes")
          .select("id, label")
          .eq("org_id", orgId);
        const codeMap = new Map((codes ?? []).map((c: { id: number; label: string }) => [c.id, c.label]));

        // Fetch absence type labels
        const { data: absences } = await supabase
          .from("absence_types")
          .select("id, label")
          .eq("org_id", orgId);
        const absMap = new Map((absences ?? []).map((a: { id: number; label: string }) => [a.id, a.label]));

        const rows: ShiftRow[] = (shiftData ?? []).map((s: Record<string, unknown>) => {
          const emp = s.employees as { first_name: string; last_name: string } | null;
          const fa = s.focus_areas as { name: string } | null;
          const publishedCodes = (s.published_shift_code_ids as number[] | null) ?? [];
          const draftCodes = (s.draft_shift_code_ids as number[] | null) ?? [];
          const isDraft = draftCodes.length > 0 && JSON.stringify(draftCodes) !== JSON.stringify(publishedCodes);
          const activeCodes = draftCodes.length > 0 ? draftCodes : publishedCodes;

          const pubAbsence = s.published_absence_type_id as number | null;
          const draftAbsence = s.draft_absence_type_id as number | null;
          const activeAbsence = draftAbsence ?? pubAbsence;

          return {
            empId: s.emp_id as string,
            empName: emp ? `${emp.first_name} ${emp.last_name}` : (s.emp_id as string).slice(0, 8),
            date: s.date as string,
            shiftCodes: activeCodes.map((id) => codeMap.get(id) ?? `?${id}`),
            absenceLabel: activeAbsence ? (absMap.get(activeAbsence) ?? null) : null,
            focusAreaName: fa?.name ?? null,
            isDraft,
          };
        }); // draft_is_delete filtered at DB level

        setShifts(rows);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load shifts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [orgId, startDate, endDate]);

  // Group by date
  const byDate = useMemo(() => {
    const map = new Map<string, ShiftRow[]>();
    for (const s of shifts) {
      const existing = map.get(s.date) ?? [];
      existing.push(s);
      map.set(s.date, existing);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px" }}
            onClick={() => setWeekOffset((w) => w - 2)}
          >
            ← Prev
          </button>
          <button
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px" }}
            onClick={() => setWeekOffset(0)}
          >
            This Week
          </button>
          <button
            className="dg-btn dg-btn-secondary"
            style={{ fontSize: "var(--dg-fs-caption)", padding: "4px 10px" }}
            onClick={() => setWeekOffset((w) => w + 2)}
          >
            Next →
          </button>
        </div>
        <span style={{ fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
          {startDate} — {endDate} ({shifts.length} shifts)
        </span>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "var(--color-danger-bg)", color: "var(--color-danger)", borderRadius: 10, fontSize: "var(--dg-fs-label)", fontWeight: 600, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: "center", color: "var(--color-text-muted)", fontSize: "var(--dg-fs-label)" }}>
          Loading schedule…
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState
          title="No shifts found"
          description="No schedule data for this date range."
        />
      ) : (
        byDate.map(([date, rows]) => (
          <div key={date} style={{ ...sectionStyle, marginBottom: 12 }}>
            <div style={{
              padding: "8px 14px", fontSize: "var(--dg-fs-label)", fontWeight: 700,
              color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border-light)",
              background: "var(--color-bg-secondary)",
            }}>
              {formatDate(date)}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Employee</th>
                    <th style={thStyle}>Shift</th>
                    <th style={thStyle}>Focus Area</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.empId}-${i}`}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{r.empName}</td>
                      <td style={tdStyle}>
                        {r.shiftCodes.length > 0 ? (
                          <span style={{ display: "inline-flex", gap: 4 }}>
                            {r.shiftCodes.map((c, j) => (
                              <span key={j} style={{
                                display: "inline-block", padding: "1px 6px", borderRadius: 4,
                                fontSize: "var(--dg-fs-caption)", fontWeight: 700,
                                background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)",
                              }}>
                                {c}
                              </span>
                            ))}
                          </span>
                        ) : r.absenceLabel ? (
                          <span style={{
                            display: "inline-block", padding: "1px 6px", borderRadius: 4,
                            fontSize: "var(--dg-fs-caption)", fontWeight: 700,
                            background: "var(--color-warning-bg, #fff8e6)", color: "var(--color-warning, #b08800)",
                          }}>
                            {r.absenceLabel}
                          </span>
                        ) : (
                          <span style={{ color: "var(--color-text-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, fontSize: "var(--dg-fs-caption)", color: "var(--color-text-muted)" }}>
                        {r.focusAreaName ?? "—"}
                      </td>
                      <td style={tdStyle}>
                        {r.isDraft ? (
                          <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-warning, #b08800)", background: "var(--color-warning-bg, #fff8e6)", padding: "1px 6px", borderRadius: 4 }}>Draft</span>
                        ) : (
                          <span style={{ fontSize: "var(--dg-fs-footnote)", fontWeight: 600, color: "var(--color-success, green)", background: "var(--color-success-bg, #e6f9e6)", padding: "1px 6px", borderRadius: 4 }}>Published</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
