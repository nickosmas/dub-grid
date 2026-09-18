import { DRAFT_BORDER_COLORS } from "@/lib/colors";
import { deriveAssignmentDefinitionIdsFromAssignments } from "@/lib/shift-job-segments";
import {
  expandDelimitedTimeRanges,
  type ShiftDiffBadgeDescriptor,
  type ShiftDiffDescriptorResult,
  type ShiftDiffTimeRange,
} from "@/lib/shift-diff-badges";
import type {
  ActiveShiftRequestSummary,
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
    background: style?.color ?? "var(--dg-color-bg)",
    color: style?.text ?? "var(--dg-color-text-muted)",
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

/** Published-change ring painted two pixels outside the pill's border. */
export function getPublishDiffRing(kind: string, fallback: string): string {
  const color = DRAFT_BORDER_COLORS[kind] ?? fallback;
  return `0 0 0 2px ${color}`;
}

export function joinBoxShadows(...values: Array<string | undefined>): string | undefined {
  const shadows = values.filter((value): value is string => !!value);
  return shadows.length > 0 ? shadows.join(", ") : undefined;
}

export const SINGLE_SHIFT_PILL_RADIUS = 8;
export const MULTI_SHIFT_PILL_RADIUS = 6;
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

/**
 * Draft annotations ("+ Time", "Changed", the replaced label) are part of
 * reading a draft, not an overlay to switch on: an unpublished cell is being
 * worked on, and what changed about it is the whole point of looking at it.
 * A deleted draft has no pill left to hang a badge off — it shows its
 * struck-through published label instead.
 */
export function cellShowsDraftDiffBadge(args: { draftKind: DraftKind }): boolean {
  return !!args.draftKind && args.draftKind !== "deleted";
}

/**
 * The badge the cell itself carries, rather than one riding on a pill.
 * "Changed" is the summary of several pill-level edits, so it belongs to the
 * cell by definition. An absence has no pills to hang a badge off — pill diffs
 * are keyed off the after-state's assignment ids, which an absence has none of
 * — so the cell carries its badge too; without that, replacing a published
 * shift with an absence never said which shift it replaced. A plain "New" stays
 * unbadged: the dashed border already reads as new.
 */
export function cellLevelDiffBadge(
  summary: ShiftDiffDescriptorResult | null | undefined,
): ShiftDiffBadgeDescriptor | null {
  if (!summary?.cellBadge) return null;
  const badge = summary.cellBadge;
  if (badge.kind === "new" && badge.text === "New") return null;
  // A removed split-shift segment has no surviving pill to carry its marker.
  // Keep that cell-level summary even when its unchanged sibling remains.
  return badge.text === "Changed" || summary.pillDiffs.length === 0 ? badge : null;
}

/**
 * The badge a published cell carries as a whole. A plain "New" is admitted
 * only while the cell has at most one pill: with two pills the cell-level
 * marker sits over the first one, which is exactly the pill that may not be
 * new (a second shift added beside a published one), so each pill carries its
 * own marker instead and the badge follows the ring.
 */
export function publishCellLevelBadge(
  summary: ShiftDiffDescriptorResult | null | undefined,
  pillCount: number,
): ShiftDiffBadgeDescriptor | null {
  const cellBadge = cellLevelDiffBadge(summary);
  if (cellBadge) return cellBadge;
  return pillCount <= 1 && summary?.cellBadge?.kind === "new" ? summary.cellBadge : null;
}

/**
 * Tooltip for the request corner fold: what kind of request is on this shift
 * and whether anyone still has to act on it.
 */
export function formatActiveRequestLabel(request: ActiveShiftRequestSummary): string {
  const kind =
    request.type === "swap"
      ? "Swap request"
      : request.type === "calloff"
        ? "Call-off"
        : "Pickup request";
  return request.status === "pending_approval" ? `${kind} awaiting approval` : `${kind} open`;
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
  timeZone?: string | null;
}): string {
  const { publishDiff, resolvePublisherName, detail } = args;
  const summary = formatPublishedMetadata({
    publishedAt: publishDiff.publishedAt,
    publishedBy: publishDiff.publishedBy,
    resolvePublisherName,
    timeZone: args.timeZone,
  });

  // The change is the primary fact. Keep the publication metadata separate so
  // the compact fallback hover card has exactly two readable lines.
  return detail ? `${detail}\n${summary}` : summary;
}

export function formatPublishedMetadata(args: {
  publishedAt: string;
  publishedBy: string | null | undefined;
  resolvePublisherName?: (userId: string) => string | null;
  timeZone?: string | null;
}): string {
  const { publishedAt: publishedAtIso, publishedBy, resolvePublisherName, timeZone } = args;
  const publisherName = publishedBy
    ? (resolvePublisherName?.(publishedBy) ?? "Unknown author")
    : null;
  const publishedAt = new Date(publishedAtIso);
  const publishedDateTime = Number.isNaN(publishedAt.getTime())
    ? "Published at an unknown time"
    : `Published ${publishedAt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        ...(timeZone ? { timeZone } : {}),
      })}`;
  const summary = `${publishedDateTime}${publisherName ? ` by ${publisherName}` : ""}.`;
  return summary;
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

/** Per-segment mentored flags in pill order, so a published mentored toggle gets its badge. */
export function mentoredFlagsFromPublishState(
  state: ScheduleCellState | null | undefined,
): boolean[] {
  if (state?.kind !== "worked") return [];
  return [...state.segments]
    .sort((left, right) => left.position - right.position)
    .map((segment) => segment.isMentored ?? false);
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
