import { absenceStripeCss, type AbsenceStripeColors } from "@dubgrid/design-tokens";
import { formatReturnDate } from "@dubgrid/domain";
import { formatAbsenceRunLabel } from "@dubgrid/schedule-core";
import React, { useRef, useState, type CSSProperties } from "react";
import { ShiftChangeCard } from "@/components/shift-change/ShiftChangeCard";
import { Popover, PopoverContent } from "@/components/ui/popover";
import {
  awayRunChips,
  describeAwayRunChanges,
  type AwayRunChanges,
  type AwayRunDayChange,
} from "./awayRunChanges";
import { PublishDiffPill } from "./publishDiffPill";
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
    /** Changes on the bar's days, which the bar carries since it covers their cells. */
    changes?: AwayRunChanges | null;
    /** Whose bar it is, heading its card: "Laura Marshall". */
    personName?: string;
  },
) {
  const label = props.label ?? awayRunLabel(props.absenceName ?? null);
  const changes = props.changes ?? null;
  const hasDraft = !!changes && changes.draft.length > 0;
  const hasPublished = !!changes && changes.published.length > 0;
  const summary = changes ? describeAwayRunChanges(changes) : null;
  const bar = (
    <div
      className="dg-away-run"
      data-away-run-bar={props.runIndex}
      data-away-run-draft={hasDraft ? "" : undefined}
      data-away-run-published={hasPublished ? "" : undefined}
      aria-hidden={summary ? undefined : "true"}
      aria-label={summary ? `${props.personName ?? ""}, ${label}: ${summary}` : undefined}
      tabIndex={summary ? 0 : undefined}
      style={{
        ...runBarFrame(props),
        background: "var(--dg-color-bg-secondary)",
        // Unpublished changes read as any draft does: a dashed outline.
        border: hasDraft ? "1.5px dashed var(--dg-color-warning)" : FILLED_PILL_BORDER,
        color: "var(--dg-color-text-secondary)",
        pointerEvents: summary ? "auto" : "none",
      }}
    >
      {summary ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 6,
            transform: "translateY(-50%)",
            display: "flex",
            gap: 3,
            maxWidth: "calc(100% - 12px)",
            zIndex: 10,
          }}
        >
          {awayRunChips(changes?.draft ?? []).map((chip) => (
            <PublishDiffPill key={`draft-${chip.kind}`} kind={chip.kind} data-away-run-chip="draft">
              {chip.text}
            </PublishDiffPill>
          ))}
          {awayRunChips(changes?.published ?? []).map((chip) => (
            <PublishDiffPill
              key={`published-${chip.kind}`}
              kind={chip.kind}
              data-away-run-chip="published"
            >
              {chip.text}
            </PublishDiffPill>
          ))}
        </span>
      ) : null}
      <RunBarLabel>{label}</RunBarLabel>
    </div>
  );
  if (!summary || !changes) return bar;
  return (
    <AwayRunChangesCard
      title={`${props.personName ? `${props.personName} · ` : ""}${label}`}
      changes={changes}
    >
      {bar}
    </AwayRunChangesCard>
  );
}

/**
 * What the bar's days change: drafts, which take effect when the period is
 * published and which staff can't see yet, and published changes while
 * Highlight changes is on. Opens on hover or focus, as a shift's card does.
 */
function AwayRunChangesCard({
  title,
  changes,
  children,
}: {
  title: string;
  changes: AwayRunChanges;
  children: React.ReactElement<
    React.HTMLAttributes<HTMLDivElement> & React.RefAttributes<HTMLDivElement>
  >;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  const trigger = React.cloneElement(children, {
    ref: (node: HTMLDivElement | null) => {
      triggerRef.current = node;
    },
    onMouseEnter: open,
    onMouseLeave: close,
    onFocus: open,
    onBlur: close,
  });
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      {trigger}
      {isOpen && triggerRef.current ? (
        <PopoverContent
          anchor={triggerRef}
          collisionPadding={12}
          positionMethod="fixed"
          side="top"
          sideOffset={8}
          data-away-run-card=""
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            padding: 12,
            borderRadius: "var(--dg-radius-md)",
            border: "1px solid var(--dg-color-border)",
            background: "var(--dg-color-surface)",
            color: "var(--dg-color-text-primary)",
            boxShadow: "var(--tooltip-shadow)",
            fontSize: "var(--dg-fs-caption)",
          }}
        >
          <div style={{ fontSize: "var(--dg-fs-label)", fontWeight: 700 }}>{title}</div>
          {changes.draft.length > 0 ? (
            <AwayRunChangeList
              heading="Not published yet. When you publish:"
              footnote="Staff still see the published schedule until then."
              days={changes.draft}
            />
          ) : null}
          {changes.published.length > 0 ? (
            <AwayRunChangeList heading="Published:" days={changes.published} />
          ) : null}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

function AwayRunChangeList({
  heading,
  footnote,
  days,
}: {
  heading: string;
  footnote?: string;
  days: readonly AwayRunDayChange[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "var(--dg-color-text-secondary)" }}>{heading}</div>
      {days.map((day) => (
        <div key={day.dateKey} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontWeight: 600 }}>{formatReturnDate(day.dateKey, { weekday: true })}</div>
          {day.view ? (
            <ShiftChangeCard change={day.view} layout="stacked" />
          ) : (
            <div style={{ color: "var(--dg-color-text-secondary)" }}>
              {day.kind === "deleted" ? "Removed" : day.kind === "new" ? "Added" : "Changed"}
            </div>
          )}
        </div>
      ))}
      {footnote ? <div style={{ color: "var(--dg-color-text-muted)" }}>{footnote}</div> : null}
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
