import { absenceStripeCss, type AbsenceStripeColors } from "@dubgrid/design-tokens";
import { formatAbsenceRunLabel } from "@dubgrid/schedule-core";
import { gridFitLine } from "./gridFit";
import { SINGLE_SHIFT_PILL_RADIUS } from "./gridHelpers";

interface AbsenceRunBarProps {
  runIndex: number;
  name: string;
  length: number;
  stripes: AbsenceStripeColors;
  top: string;
  left: string;
  sideInset: number;
  bottom: number;
}

/**
 * One bar for a whole-day absence on days in a row (item 52), drawn from the
 * run's first cell across the rest. Each day keeps its own transparent pill
 * above it for clicks, drags and its marks, so the bar itself takes no
 * pointer events. Day columns share one width, so N cells are N times this
 * cell's width.
 */
export function AbsenceRunBar({
  runIndex,
  name,
  length,
  stripes,
  top,
  left,
  sideInset,
  bottom,
}: AbsenceRunBarProps) {
  return (
    <div
      className="dg-absence-run"
      data-absence-run-bar={runIndex}
      aria-hidden="true"
      style={{
        position: "absolute",
        top,
        bottom,
        left,
        right: `calc(${-(length - 1)} * 100% + ${sideInset}px)`,
        background: absenceStripeCss(stripes.stripeA, stripes.stripeB),
        border: `1px solid ${stripes.border}`,
        borderRadius: SINGLE_SHIFT_PILL_RADIUS,
        color: stripes.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2px 6px",
        pointerEvents: "none",
      }}
    >
      <span
        data-pill-fit=""
        className="dg-absence-run__label"
        style={{ ...gridFitLine("var(--dg-fs-caption)"), fontWeight: 600, lineHeight: 1.2 }}
      >
        {formatAbsenceRunLabel(name, length)}
      </span>
    </div>
  );
}

/**
 * Hovering a day in a run marks the day (dashed edges), hides the run's label
 * and lights the day's column header. Set on the DOM rather than in state so
 * the grid never re-renders on hover.
 */
export function setAbsenceRunHover(cell: HTMLElement, hovered: boolean): void {
  const row = cell.closest('[role="row"]');
  const grid = cell.closest('[role="grid"]');
  const header = grid?.querySelector(
    `[role="columnheader"][data-date-key="${cell.dataset.dateKey}"]`,
  );
  if (!hovered) {
    for (const element of [
      cell,
      header,
      ...Array.from(row?.querySelectorAll("[data-run-hover]") ?? []),
    ]) {
      element?.removeAttribute("data-run-hover");
    }
    return;
  }
  const bar = row?.querySelector(`[data-absence-run-bar="${cell.dataset.absenceRunIndex}"]`);
  for (const element of [cell, header, bar]) {
    element?.setAttribute("data-run-hover", "true");
  }
}
