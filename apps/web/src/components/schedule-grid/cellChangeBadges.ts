import {
  buildShiftDiffDescriptors,
  expandDelimitedTimeRanges,
  type ShiftDiffBadgeDescriptor,
  type ShiftDiffDescriptorResult,
} from "@/lib/shift-diff-badges";
import type { DraftKind, PublishChange, ScheduleCellStateEntry, ShiftJobSegment } from "@/types";
import { getGridDiffBadgeLabel, type GridDiffBadgeConfig } from "./badges";
import {
  absenceTypeIdFromPublishState,
  assignmentIdsFromPublishState,
  cellLevelDiffBadge,
  cellShowsDraftDiffBadge,
  mentoredFlagsFromPublishState,
  publishCellLevelBadge,
  splitShiftLabelParts,
  timeRangesFromPublishState,
} from "./gridHelpers";

export type CellChangeBadge = Pick<GridDiffBadgeConfig, "source" | "kind" | "text"> & {
  /** The compact chip text the grid renders for this kind: New, Edited or Deleted. */
  label: string;
  detail: string;
};

export type CellChangeBadges = {
  /**
   * One slot per after-state pill, in pill order. A badge the grid hangs on
   * the cell as a whole (a "Changed" summary, a replaced absence, a deletion)
   * rides on the first pill here, since pills stack instead of sharing a cell.
   */
  pillBadges: Array<CellChangeBadge | null>;
  /** Dashed draft border per pill; null for a pill the draft left as published. */
  pillBorderKinds: DraftKind[];
};

type ResolveCellChangeBadgesInput = {
  entry: ScheduleCellStateEntry | null | undefined;
  publishChange: PublishChange | null | undefined;
  pillCount: number;
  /** Shift/job pair to assignment id, archived included, for published snapshots. */
  publishedAssignmentIdByPair: Map<string, number>;
  resolveAssignmentLabel: (assignmentId: number) => string;
  resolveAbsenceLabel: (absenceTypeId: number) => string;
};

function toBadge(
  source: GridDiffBadgeConfig["source"],
  descriptor: ShiftDiffBadgeDescriptor,
): CellChangeBadge {
  return {
    source,
    kind: descriptor.kind,
    text: descriptor.text,
    label: getGridDiffBadgeLabel(descriptor.kind),
    detail: descriptor.detail,
  };
}

function deletedBadge(source: GridDiffBadgeConfig["source"], detail: string): CellChangeBadge {
  return { source, kind: "deleted", text: "Deleted", label: "Deleted", detail };
}

function sortedSegments(segments: ShiftJobSegment[] | undefined): ShiftJobSegment[] {
  return [...(segments ?? [])].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
}

/**
 * The pill-level badge a source contributes. A draft "New" is already the
 * dashed border; only a published addition earns the green chip.
 */
function pillBadgeFor(
  source: GridDiffBadgeConfig["source"],
  descriptor: ShiftDiffBadgeDescriptor | null | undefined,
): CellChangeBadge | null {
  if (!descriptor || (descriptor.kind === "new" && source === "draft")) return null;
  return toBadge(source, descriptor);
}

function isMeaningfulPublishChange(
  change: PublishChange | null | undefined,
): change is PublishChange {
  // A period's first publication is the baseline, not a set of additions.
  return !!change && !(change.kind === "new" && change.isNewAddition === false);
}

function buildDraftDiff(
  entry: ScheduleCellStateEntry,
  input: ResolveCellChangeBadgesInput,
): ShiftDiffDescriptorResult {
  const publishedIds = entry.publishedAssignmentDefinitionIds ?? [];
  const currentIds = entry.assignmentIds ?? [];
  return buildShiftDiffDescriptors({
    before: {
      assignmentIds: publishedIds,
      absenceTypeId: entry.publishedAbsenceTypeId ?? null,
      isMentoredFlags: sortedSegments(entry.publishedSegments).map(
        (segment) => segment.isMentored ?? false,
      ),
      timeRanges: expandDelimitedTimeRanges(
        entry.publishedCustomStartTime,
        entry.publishedCustomEndTime,
        publishedIds.length,
      ),
    },
    after: {
      assignmentIds: currentIds,
      absenceTypeId: entry.absenceTypeId ?? null,
      isMentoredFlags: sortedSegments(entry.segments).map((segment) => segment.isMentored ?? false),
      timeRanges: expandDelimitedTimeRanges(
        entry.customStartTime,
        entry.customEndTime,
        currentIds.length,
      ),
    },
    beforeShiftLabels: splitShiftLabelParts(entry.publishedLabel),
    afterShiftLabels: splitShiftLabelParts(entry.label),
    resolveAssignmentDefinitionLabel: input.resolveAssignmentLabel,
    resolveAbsenceLabel: input.resolveAbsenceLabel,
  });
}

function buildPublishDiff(
  change: PublishChange,
  input: ResolveCellChangeBadgesInput,
): ShiftDiffDescriptorResult {
  const from =
    change.from ??
    assignmentIdsFromPublishState(change.fromState, input.publishedAssignmentIdByPair);
  const to =
    change.to ?? assignmentIdsFromPublishState(change.toState, input.publishedAssignmentIdByPair);
  return buildShiftDiffDescriptors({
    before: {
      assignmentIds: from,
      absenceTypeId: change.fromAbsenceTypeId ?? absenceTypeIdFromPublishState(change.fromState),
      timeRanges: timeRangesFromPublishState(
        change.fromState,
        change.fromCustomStart,
        change.fromCustomEnd,
        from.length,
      ),
      isMentoredFlags: mentoredFlagsFromPublishState(change.fromState),
    },
    after: {
      assignmentIds: to,
      absenceTypeId: change.toAbsenceTypeId ?? absenceTypeIdFromPublishState(change.toState),
      timeRanges: timeRangesFromPublishState(
        change.toState,
        change.toCustomStart,
        change.toCustomEnd,
        to.length,
      ),
      isMentoredFlags: mentoredFlagsFromPublishState(change.toState),
    },
    beforeShiftLabels: from.map(input.resolveAssignmentLabel),
    afterShiftLabels: to.map(input.resolveAssignmentLabel),
    resolveAssignmentDefinitionLabel: input.resolveAssignmentLabel,
    resolveAbsenceLabel: input.resolveAbsenceLabel,
  });
}

function hasCellContent(entry: ScheduleCellStateEntry | null): boolean {
  return (
    !!entry &&
    !entry.isDelete &&
    ((entry.assignmentIds ?? []).length > 0 || entry.absenceTypeId != null)
  );
}

/**
 * The change chips a cell shows, resolved the same way the schedule grid does
 * so every surface that repeats a cell (the dashboard's schedule strip, the
 * user dashboard's hero and week list) marks the same pills. A draft outranks
 * a published change on the same pill, a cell-level summary ("Changed", a
 * replaced absence, a deletion) rides on the first pill, and a plain draft
 * "New" is the dashed border alone.
 */
export function resolveCellChangeBadges(input: ResolveCellChangeBadgesInput): CellChangeBadges {
  const entry = input.entry ?? null;
  const draftKind = entry?.draftKind ?? null;
  const publishChange = isMeaningfulPublishChange(input.publishChange) ? input.publishChange : null;
  const perPill = <T>(value: (index: number) => T): T[] =>
    Array.from({ length: input.pillCount }, (_, index) => value(index));

  if (draftKind === "deleted") {
    const badge = deletedBadge("draft", "Deleted the published shift.");
    return {
      pillBadges: perPill((index) => (index === 0 ? badge : null)),
      pillBorderKinds: perPill(() => "deleted" as const),
    };
  }

  if (publishChange?.kind === "deleted" && !hasCellContent(entry)) {
    const badge = deletedBadge("publish", "Deleted.");
    return {
      pillBadges: perPill((index) => (index === 0 ? badge : null)),
      pillBorderKinds: perPill(() => null),
    };
  }

  const showsDraftBadge = cellShowsDraftDiffBadge({ draftKind });
  const draftDiff = showsDraftBadge && entry ? buildDraftDiff(entry, input) : null;
  const publishDiff = publishChange ? buildPublishDiff(publishChange, input) : null;

  const draftCellDescriptor = showsDraftBadge ? cellLevelDiffBadge(draftDiff) : null;
  const publishCellDescriptor = publishDiff
    ? publishCellLevelBadge(publishDiff, input.pillCount)
    : null;
  const draftCellBadge = draftCellDescriptor ? toBadge("draft", draftCellDescriptor) : null;
  const publishCellBadge = publishCellDescriptor ? toBadge("publish", publishCellDescriptor) : null;

  // A cell-level chip silences its own source's pill chips unless it is the
  // "Changed" summary, which still lets each pill say what happened to it.
  const pillBadges = perPill((index) => {
    const draftPill =
      showsDraftBadge && (draftCellBadge == null || draftCellBadge.text === "Changed")
        ? pillBadgeFor("draft", draftDiff?.pillDiffs[index]?.badge)
        : null;
    const publishPill =
      publishCellBadge == null || publishCellBadge.text === "Changed"
        ? pillBadgeFor("publish", publishDiff?.pillDiffs[index]?.badge)
        : null;
    // The draft is the newer state, so it outranks a published chip on the
    // same pill, cell-level or not.
    return index === 0
      ? (draftCellBadge ?? draftPill ?? publishCellBadge ?? publishPill)
      : (draftPill ?? publishPill);
  });

  // A single pill inherits the cell's draft kind when the diff has nothing
  // finer to say; with several pills only a pill the draft touched is dashed.
  const fallbackBorder: DraftKind =
    draftKind === "new" || draftKind === "modified" ? draftKind : null;
  const pillBorderKinds = perPill((index): DraftKind => {
    const pillDiff = draftDiff?.pillDiffs[index];
    if (!pillDiff) return fallbackBorder;
    return input.pillCount === 1 ? (pillDiff.borderKind ?? fallbackBorder) : pillDiff.borderKind;
  });

  return { pillBadges, pillBorderKinds };
}
