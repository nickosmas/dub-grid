import { absenceStripeCss, type AbsenceStripeColors } from "@dubgrid/design-tokens";
import { formatAbsenceRunLabel } from "@dubgrid/schedule-core";
import type { CSSProperties } from "react";
import { awayRunLabel } from "./awayRuns";
import { gridFitLine } from "./gridFit";
import { FILLED_PILL_BORDER } from "@/lib/colors";
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
        ...runBarFrame({ top, bottom, left, length, sideInset }),
        background: absenceStripeCss(stripes.stripeA, stripes.stripeB),
        border: FILLED_PILL_BORDER,
        color: stripes.text,
      }}
    >
      <RunBarLabel>{formatAbsenceRunLabel(name, length)}</RunBarLabel>
    </div>
  );
}

type RunBarFrame = Pick<AbsenceRunBarProps, "top" | "left" | "sideInset" | "bottom" | "length">;

/** Where a run's bar sits: from its first cell across `length` cells. */
function runBarFrame({ top, bottom, left, length, sideInset }: RunBarFrame): CSSProperties {
  return {
    position: "absolute",
    top,
    bottom,
    left,
    right: `calc(${-(length - 1)} * 100% + ${sideInset}px)`,
    borderRadius: SINGLE_SHIFT_PILL_RADIUS,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "2px 6px",
    pointerEvents: "none",
  };
}

function RunBarLabel({ children }: { children: string }) {
  return (
    <span
      data-pill-fit=""
      className="dg-absence-run__label"
      style={{ ...gridFitLine("var(--dg-fs-caption)"), fontWeight: 600, lineHeight: 1.2 }}
    >
      {children}
    </span>
  );
}

/**
 * The days someone is away until their return date (51e), drawn like an
 * absence run but in neutral colors, since nothing is wrong. It is one label
 * across the stretch, with no count, naming the absence the days hold (51f). The days can't be scheduled, so their
 * cells hold nothing else.
 */
export function AwayRunBar(
  props: RunBarFrame & {
    runIndex: number;
    absenceName?: string | null;
    /** In place of the Away label, as "Offboarded" after a last day (51g2). */
    label?: string;
  },
) {
  return (
    <div
      className="dg-away-run"
      data-away-run-bar={props.runIndex}
      aria-hidden="true"
      style={{
        ...runBarFrame(props),
        background: "var(--dg-color-bg-secondary)",
        border: FILLED_PILL_BORDER,
        color: "var(--dg-color-text-secondary)",
      }}
    >
      <RunBarLabel>{props.label ?? awayRunLabel(props.absenceName ?? null)}</RunBarLabel>
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
