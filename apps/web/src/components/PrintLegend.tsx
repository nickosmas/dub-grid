import { Fragment } from "react";
import { AssignmentDefinition, FocusArea, IndicatorType, ShiftDisplayMode } from "@/types";
import { ScheduleNoteIcon } from "@/components/schedule-grid/noteIcon";

// Excluded from legend — internal/meta entries with no printed meaning
const EXCLUDED = new Set(["OFF", "0.3"]);

/**
 * The key's shifts under their focus area, org-wide ones first, since two
 * areas can share a code and a name. One group prints without a heading.
 */
export function legendGroupsByFocusArea<T extends { focusAreaId?: number | null }>(
  items: readonly T[],
  focusAreas: readonly Pick<FocusArea, "id" | "name">[],
): { title: string | null; items: T[] }[] {
  const orgWide = items.filter((item) => item.focusAreaId == null);
  const known = new Set(focusAreas.map((focusArea) => focusArea.id));
  const groups = [
    { title: null, items: orgWide },
    ...focusAreas.map((focusArea) => ({
      title: focusArea.name as string | null,
      items: items.filter((item) => item.focusAreaId === focusArea.id),
    })),
    {
      title: null,
      items: items.filter((item) => item.focusAreaId != null && !known.has(item.focusAreaId)),
    },
  ].filter((group) => group.items.length > 0);
  return groups.length === 1 ? [{ title: null, items: groups[0].items }] : groups;
}

export default function PrintLegend({
  assignments,
  focusAreas = [],
  shiftDisplayMode = "code",
  indicators = [],
}: {
  assignments: AssignmentDefinition[];
  focusAreas?: FocusArea[];
  shiftDisplayMode?: ShiftDisplayMode;
  /** The indicators the printed schedule shows, keyed beneath the shifts. */
  indicators?: IndicatorType[];
}) {
  const isNameMode = shiftDisplayMode === "name";
  const items = assignments.filter((s) => !EXCLUDED.has(s.label));

  return (
    <div className="print-legend">
      <div className="print-legend__title">Shift key</div>
      {legendGroupsByFocusArea(items, focusAreas).map((group, index) => (
        <Fragment key={group.title ?? `group-${index}`}>
          {group.title ? <div className="print-legend__group">{group.title}</div> : null}
          <div className="print-legend__grid">
            {group.items.map((s) => (
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
        </Fragment>
      ))}
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
