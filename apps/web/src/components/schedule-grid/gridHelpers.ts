import { DRAFT_BORDER_COLORS } from "@/lib/colors";
import { deriveAssignmentDefinitionIdsFromAssignments } from "@/lib/shift-job-segments";
import { expandDelimitedTimeRanges, type ShiftDiffTimeRange } from "@/lib/shift-diff-badges";
import type {
  GridCellId,
  AssignmentDefinition,
  DraftKind,
  PublishChange,
  ScheduleCellState,
} from "@/types";

export function getFocusAreaInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

export function getCrossFocusBadgePalette(
  style?: Pick<AssignmentDefinition, "color" | "text"> | null,
) {
  return {
    background: style?.color ?? "var(--color-bg)",
    color: style?.text ?? "var(--color-text-muted)",
  };
}

/** Returns true if the given HH:MM times represent an overnight shift (crosses midnight).
 *  An end time of "00:00" means midnight (end of day), not start of next day. */
export function isOvernightTimes(
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  if (!start || !end) return false;
  // Normalize to HH:MM — DB TIME columns may include seconds ("00:00:00")
  const s = start.slice(0, 5);
  const e = end.slice(0, 5);
  const effectiveEnd = e === "00:00" ? "24:00" : e;
  return s > effectiveEnd;
}

export function getDraftBorder(draftKind: DraftKind, fallback: string): string {
  if (!draftKind) return fallback;
  return `2px dashed ${DRAFT_BORDER_COLORS[draftKind]}`;
}

export function getPublishDiffBoxShadow(kind: string, fallback: string): string {
  const color = DRAFT_BORDER_COLORS[kind] ?? fallback;
  return `0 0 0 1px var(--color-surface), 0 0 0 2.5px ${color}`;
}

export function joinBoxShadows(...values: Array<string | undefined>): string | undefined {
  const shadows = values.filter((value): value is string => !!value);
  return shadows.length > 0 ? shadows.join(", ") : undefined;
}

export const SINGLE_SHIFT_PILL_RADIUS = 8;
export const MULTI_SHIFT_PILL_RADIUS = 6;
export const RAISED_DIFF_BADGE_TOP_INSET = 10;
export const SINGLE_CROSS_FOCUS_CONTENT_LEFT_PADDING = 24;
export const MULTI_CROSS_FOCUS_CONTENT_LEFT_PADDING = 20;
export const BULK_SELECTION_RING_PADDING = 2;

export function areGridCellIdsEqual(
  left: GridCellId | null | undefined,
  right: GridCellId | null | undefined,
): boolean {
  if (!left || !right) return false;
  return (
    left.empId === right.empId &&
    left.dateKey === right.dateKey &&
    left.sectionId === right.sectionId
  );
}

export function getGridCellKey(cellId: Pick<GridCellId, "empId" | "dateKey">): string {
  return `${cellId.empId}_${cellId.dateKey}`;
}

export function getBulkSelectionRingStyle(args: {
  topInset: number;
  rightInset: number;
  bottomInset: number;
  leftInset: number;
  topDividerInset: number;
  leadingDividerInset: number;
  pillRadius: number;
}): React.CSSProperties {
  const padding = BULK_SELECTION_RING_PADDING;
  return {
    top: `${args.topDividerInset + args.topInset - padding}px`,
    right: `${args.rightInset - padding}px`,
    bottom: `${args.bottomInset - padding}px`,
    left: `${args.leadingDividerInset + args.leftInset - padding}px`,
    borderRadius: args.pillRadius + padding,
  };
}

export function getInsetDividerShadow(args: {
  color: string;
  side?: "left" | "right";
  width?: number;
}): string {
  const { color, side = "left", width = 1 } = args;
  const horizontalOffset = side === "left" ? width : -width;
  return `inset ${horizontalOffset}px 0 0 0 ${color}`;
}

export function cellShowsDraftDiffBadge(args: {
  draftKind: DraftKind;
  showDiffOverlay: boolean;
}): boolean {
  const { draftKind, showDiffOverlay } = args;
  return showDiffOverlay && !!draftKind && draftKind !== "deleted";
}

export function formatRelativePublishTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;

  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export function buildPublishTooltip(args: {
  publishDiff: PublishChange & { publishedAt: string; publishedBy: string };
  resolvePublisherName?: (userId: string) => string | null;
  detail?: string;
}): string {
  const { publishDiff, resolvePublisherName, detail } = args;
  const publisherName = publishDiff.publishedBy
    ? resolvePublisherName?.(publishDiff.publishedBy)
    : null;
  const summary = `Published ${formatRelativePublishTime(publishDiff.publishedAt)}${publisherName ? ` by ${publisherName}` : ""}.`;

  return detail ? `${summary} ${detail}` : summary;
}

export function timeRangesFromCustomTimes(args: {
  customTimes:
    | {
        start: string;
        end: string;
        perPill?: { start: string; end: string }[];
      }
    | null
    | undefined;
  count: number;
}): ShiftDiffTimeRange[] {
  const { customTimes, count } = args;
  if (count === 0) return [];
  if (customTimes?.perPill?.length) {
    return Array.from({ length: count }, (_, index) => ({
      start: customTimes.perPill?.[index]?.start ?? null,
      end: customTimes.perPill?.[index]?.end ?? null,
    }));
  }
  return Array.from({ length: count }, (_, index) => ({
    start: index === 0 ? (customTimes?.start ?? null) : null,
    end: index === 0 ? (customTimes?.end ?? null) : null,
  }));
}

export function splitShiftLabelParts(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function assignmentIdsFromPublishState(
  state: ScheduleCellState | null | undefined,
  assignmentIdByPair: Map<string, number>,
): number[] {
  if (state?.kind !== "worked") return [];
  const orderedSegments = [...state.segments].sort((left, right) => left.position - right.position);
  return deriveAssignmentDefinitionIdsFromAssignments(
    {
      shiftIds: orderedSegments.map((segment) => segment.shiftId),
      jobIds: orderedSegments.map((segment) => segment.jobId),
    },
    assignmentIdByPair,
  );
}

export function absenceTypeIdFromPublishState(
  state: ScheduleCellState | null | undefined,
): number | null {
  return state?.kind === "absence" ? state.absenceTypeId : null;
}

export function timeRangesFromPublishState(
  state: ScheduleCellState | null | undefined,
  fallbackStart: string | null | undefined,
  fallbackEnd: string | null | undefined,
  count: number,
): ShiftDiffTimeRange[] {
  if (count === 0) return [];
  return expandDelimitedTimeRanges(
    state?.customStartTime ?? fallbackStart,
    state?.customEndTime ?? fallbackEnd,
    count,
  );
}
