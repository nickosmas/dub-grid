import { AssignmentDefinition, IndicatorType, ShiftDisplayMode } from "@/types";
import { ScheduleNoteIcon } from "@/components/schedule-grid/noteIcon";

// Excluded from legend — internal/meta entries with no printed meaning
const EXCLUDED = new Set(["OFF", "0.3"]);

export default function PrintLegend({
  assignments,
  shiftDisplayMode = "code",
  indicators = [],
}: {
  assignments: AssignmentDefinition[];
  shiftDisplayMode?: ShiftDisplayMode;
  /** The indicators the printed schedule shows, keyed beneath the shifts. */
  indicators?: IndicatorType[];
}) {
  const isNameMode = shiftDisplayMode === "name";
  const items = assignments.filter((s) => !EXCLUDED.has(s.label));

  return (
    <div className="print-legend">
      <div className="print-legend__title">Shift Key</div>
      <div className="print-legend__grid">
        {items.map((s) => (
          <div key={s.id} className="print-legend__item">
            <span
              className="print-legend__badge"
              style={{
                background: s.color,
                border: `1.5px solid ${s.border}`,
                color: s.text,
              }}
            >
              {isNameMode ? s.name || s.label : s.label}
            </span>
            {!isNameMode && <span className="print-legend__name">{s.name}</span>}
          </div>
        ))}
      </div>
      {indicators.length > 0 && (
        <>
          <div className="print-legend__title">Schedule notes</div>
          <div className="print-legend__grid" data-print-legend-indicators="true">
            {indicators.map((indicator) => (
              <div key={indicator.id} className="print-legend__item">
                <ScheduleNoteIcon size={12} />
                <span className="print-legend__name">{indicator.name}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
