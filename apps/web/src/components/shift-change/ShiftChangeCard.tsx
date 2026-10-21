import { Fragment } from "react";
import {
  formatScheduleTimeValue,
  formatShiftChangeHours,
  type ShiftChange,
  type ShiftChangeItem,
  type ShiftChangeItemLabel,
  type ShiftChangeSide,
  type ShiftChangeTextPart,
} from "@dubgrid/schedule-core";
import { cn } from "@/lib/utils";

type SideTone = "before" | "after";

const LABEL_TEXT: Record<ShiftChangeItemLabel, string> = {
  shift1: "Shift 1",
  shift2: "Shift 2",
  absence: "Absence",
};

/** Consecutive marked parts read as one highlighted run, as on the canvas. */
function MarkedText({ parts, tone }: { parts: ShiftChangeTextPart[]; tone: SideTone }) {
  const runs: Array<{ text: string; changed: boolean }> = [];
  for (const part of parts) {
    const changed = Boolean(part.changed);
    const last = runs.at(-1);
    if (last && last.changed === changed) last.text += part.text;
    else runs.push({ text: part.text, changed });
  }
  return (
    <>
      {runs.map((run, index) =>
        run.changed ? (
          <mark
            key={index}
            className={cn(
              "rounded-[4px] px-1 font-semibold",
              tone === "before"
                ? "bg-bg-secondary text-text-primary"
                : "bg-brand-bg text-accent-text",
            )}
          >
            {run.text}
          </mark>
        ) : (
          <Fragment key={index}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}

function StatusTag({ item }: { item: ShiftChangeItem }) {
  if (item.status !== "added" && item.status !== "removed") return null;
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2 py-px text-[11px] font-bold",
        item.status === "removed"
          ? "bg-bg-secondary text-text-secondary"
          : "bg-brand-bg text-accent-text",
      )}
    >
      {item.status === "removed" ? "Removed" : "Added"}
    </span>
  );
}

function BreakLine({ item }: { item: ShiftChangeItem }) {
  if (!item.breakBefore) return null;
  const { minutes, start, end } = item.breakBefore;
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold text-text-muted dg-tabular-nums">
      <span aria-hidden className="h-0 flex-1 border-t border-dashed border-border" />
      <span>
        Break · {formatShiftChangeHours(minutes)}, {formatScheduleTimeValue(start)} -{" "}
        {formatScheduleTimeValue(end)}
      </span>
      <span aria-hidden className="h-0 flex-1 border-t border-dashed border-border" />
    </div>
  );
}

function ChangeItem({ item, tone }: { item: ShiftChangeItem; tone: SideTone }) {
  const hasKicker = item.label != null || item.status === "added" || item.status === "removed";
  const removed = item.status === "removed";
  return (
    <div className="flex flex-col gap-0.5">
      {hasKicker ? (
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted">
          {item.label ? <span>{LABEL_TEXT[item.label]}</span> : null}
          <StatusTag item={item} />
        </div>
      ) : null}
      <div
        className={cn(
          "text-[14px] font-semibold leading-snug",
          removed ? "text-text-muted" : "text-text-primary",
        )}
      >
        <MarkedText parts={item.title} tone={tone} />
      </div>
      {item.detail.length > 0 ? (
        <div
          className={cn(
            "text-[13px] leading-snug dg-tabular-nums",
            removed ? "text-text-muted" : "text-text-secondary",
          )}
        >
          <MarkedText parts={item.detail} tone={tone} />
        </div>
      ) : null}
    </div>
  );
}

function DayBar({
  side,
  scale,
}: {
  side: ShiftChangeSide;
  scale: NonNullable<ShiftChange["barScale"]>;
}) {
  const width = (from: number, to: number) => ({
    left: `${(from / scale.minutes) * 100}%`,
    width: `${((to - from) / scale.minutes) * 100}%`,
  });
  const description = side.items.map((item) => item.plain).join(", then ");
  return (
    <div
      role="img"
      aria-label={description}
      className="relative h-6 overflow-hidden rounded-[6px] bg-bg-secondary"
    >
      {side.items.map((item, index) => {
        const segments = [];
        if (item.breakBefore && item.bar) {
          segments.push(
            <span
              key={`gap-${index}`}
              className="absolute inset-y-0 flex items-center justify-center border border-dashed border-border bg-surface text-[11px] text-text-muted"
              style={width(item.bar.from - item.breakBefore.minutes, item.bar.from)}
            >
              Break
            </span>,
          );
        }
        if (item.bar) {
          segments.push(
            <span
              key={`item-${index}`}
              className={cn(
                "absolute inset-y-0 flex items-center overflow-hidden whitespace-nowrap border-r-2 border-surface px-1.5 text-[11px] font-semibold",
                item.kind === "absence"
                  ? "bg-[repeating-linear-gradient(135deg,var(--dg-color-border-light)_0,var(--dg-color-border-light)_6px,var(--dg-color-bg-secondary)_6px,var(--dg-color-bg-secondary)_12px)] text-text-secondary"
                  : "bg-brand-bg text-accent-text",
              )}
              style={width(item.bar.from, item.bar.to)}
            >
              {item.title.map((part) => part.text).join("")}
            </span>,
          );
        }
        return segments;
      })}
    </div>
  );
}

function SideBlock({
  heading,
  side,
  tone,
  showTotal,
  scale,
}: {
  heading: string;
  side: ShiftChangeSide;
  tone: SideTone;
  showTotal: boolean;
  scale: ShiftChange["barScale"];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div
        className={cn(
          "flex items-baseline justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.08em]",
          tone === "before" ? "text-text-muted" : "text-brand",
        )}
      >
        <span>{heading}</span>
        {showTotal && side.totalMinutes != null ? (
          <span className="text-[12px] font-semibold normal-case tracking-normal text-text-secondary dg-tabular-nums">
            {formatShiftChangeHours(side.totalMinutes)}
          </span>
        ) : null}
      </div>
      {scale && side.items.some((item) => item.bar) ? <DayBar side={side} scale={scale} /> : null}
      {side.items.length === 0 ? (
        <div className="text-[13px] italic text-text-muted">No shift</div>
      ) : (
        side.items.map((item, index) => (
          <Fragment key={index}>
            <BreakLine item={item} />
            <ChangeItem item={item} tone={tone} />
          </Fragment>
        ))
      )}
    </div>
  );
}

/** Before and After, side by side when wide, stacked when narrow. */
export function ShiftChangeCard({
  change,
  layout = "wide",
  showDayBar = false,
  className,
}: {
  change: ShiftChange;
  layout?: "wide" | "stacked";
  showDayBar?: boolean;
  className?: string;
}) {
  if (change.kind === "none") return null;
  const multi = change.kind === "multi";
  const scale = showDayBar ? change.barScale : null;
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-[10px] border border-border-light bg-surface",
        layout === "wide" ? "grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      <div className="bg-bg px-3.5 py-3">
        <SideBlock
          heading="Before"
          side={change.before}
          tone="before"
          showTotal={multi}
          scale={scale}
        />
      </div>
      <div
        className={cn(
          "px-3.5 py-3",
          layout === "wide" ? "border-l border-border-light" : "border-t border-border-light",
        )}
      >
        <SideBlock
          heading="After"
          side={change.after}
          tone="after"
          showTotal={multi}
          scale={scale}
        />
      </div>
    </div>
  );
}

/** Only the old side, for places that already show the new shift. */
export function ShiftChangeWas({ change, className }: { change: ShiftChange; className?: string }) {
  if (change.kind === "none") return null;
  return (
    <div className={cn("rounded-[8px] border border-border-light bg-bg px-3 py-2.5", className)}>
      <SideBlock
        heading="Was"
        side={change.before}
        tone="before"
        showTotal={change.kind === "multi"}
        scale={null}
      />
    </div>
  );
}
