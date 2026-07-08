import {
  buildShiftJobPairKey,
  deriveAssignmentDefinitionIdsFromSegments,
  joinShiftJobSegmentLabels,
  resolveShiftJobSegments,
  type SegmentCompatibilityMaps,
} from "@/lib/shift-job-segments";
import type { DbScheduleCell, DbScheduleCellSnapshot } from "@/lib/db/types";
import type {
  DraftKind,
  ScheduleCellInput,
  ScheduleCellKind,
  ScheduleCellSegmentInput,
  ScheduleCellSegmentSnapshot,
  ScheduleCellSnapshot,
  ScheduleCellStateEntry,
} from "@/types";

type BuildScheduleCellSnapshotArgs = {
  kind: ScheduleCellKind;
  segments?: ScheduleCellSegmentSnapshot[];
  assignmentIds?: number[];
  absenceTypeId?: number | null;
  customStartTime?: string | null;
  customEndTime?: string | null;
  seriesId?: string | null;
  fromRecurring?: boolean;
  assignmentLabelMap?: Map<number, string>;
  absenceTypeMap?: Map<number, string>;
};

type ScheduleCellMapperOptions = {
  isScheduler: boolean;
  assignmentLabelMap: Map<number, string>;
  assignmentIdByPair?: Map<string, number>;
  absenceTypeMap?: Map<number, string>;
  segmentCompatibility?: SegmentCompatibilityMaps | null;
};

function sortSegments<T extends { position: number }>(segments: T[]): T[] {
  return [...segments].sort((left, right) => left.position - right.position);
}

function cloneSegments(segments: ScheduleCellSegmentSnapshot[]): ScheduleCellSegmentSnapshot[] {
  return segments.map((segment) => ({ ...segment }));
}

function resolveCodeLabels(ids: number[], codeMap?: Map<number, string>): string {
  if (!codeMap || ids.length === 0) return "";
  return ids.map((id) => codeMap.get(id) ?? "?").join("/");
}

function buildSnapshotLabel(
  args: BuildScheduleCellSnapshotArgs,
  orderedSegments: ScheduleCellSegmentSnapshot[],
): string {
  if (args.kind === "deleted") return "";

  if (args.kind === "absence") {
    return args.absenceTypeMap?.get(args.absenceTypeId ?? -1) ?? "?";
  }

  if (orderedSegments.length > 0) {
    return joinShiftJobSegmentLabels(orderedSegments);
  }

  return resolveCodeLabels(args.assignmentIds ?? [], args.assignmentLabelMap);
}

function hasWorkedIdentity(
  snapshot: ScheduleCellSnapshot | null,
): snapshot is ScheduleCellSnapshot & { kind: "worked" } {
  return !!snapshot && snapshot.kind === "worked";
}

function hasSnapshotContent(snapshot: ScheduleCellSnapshot | null): boolean {
  if (!snapshot) return false;
  if (snapshot.kind === "deleted") return true;
  if (snapshot.kind === "absence") return snapshot.absenceTypeId != null;
  return (
    snapshot.segments.length > 0 ||
    snapshot.assignmentIds.length > 0 ||
    snapshot.customStartTime != null ||
    snapshot.customEndTime != null
  );
}

function buildDeletedSnapshot(input: {
  seriesId?: string | null;
  fromRecurring?: boolean;
}): ScheduleCellSnapshot {
  return {
    kind: "deleted",
    segments: [],
    absenceTypeId: null,
    customStartTime: null,
    customEndTime: null,
    seriesId: input.seriesId ?? null,
    fromRecurring: input.fromRecurring ?? false,
    label: "",
    assignmentIds: [],
  };
}

export function buildScheduleCellSnapshot(
  args: BuildScheduleCellSnapshotArgs,
): ScheduleCellSnapshot {
  if (args.kind === "deleted") {
    return buildDeletedSnapshot(args);
  }

  const orderedSegments = args.kind === "worked" ? sortSegments(args.segments ?? []) : [];

  return {
    kind: args.kind,
    segments: cloneSegments(orderedSegments),
    absenceTypeId: args.kind === "absence" ? (args.absenceTypeId ?? null) : null,
    customStartTime: args.kind === "worked" ? (args.customStartTime ?? null) : null,
    customEndTime: args.kind === "worked" ? (args.customEndTime ?? null) : null,
    seriesId: args.seriesId ?? null,
    fromRecurring: args.fromRecurring ?? false,
    label: buildSnapshotLabel(args, orderedSegments),
    assignmentIds: args.kind === "worked" ? [...(args.assignmentIds ?? [])] : [],
  };
}

export function cloneScheduleCellSnapshot(
  snapshot: ScheduleCellSnapshot | null | undefined,
): ScheduleCellSnapshot | null {
  if (!snapshot) return null;
  return {
    ...snapshot,
    segments: cloneSegments(snapshot.segments),
    assignmentIds: [...snapshot.assignmentIds],
  };
}

export function scheduleCellSnapshotToInput(
  snapshot: ScheduleCellSnapshot | null | undefined,
): ScheduleCellInput | null {
  if (!snapshot) return null;
  return {
    kind: snapshot.kind,
    segments: snapshot.segments.map((segment): ScheduleCellSegmentInput => ({
      shiftId: segment.shiftId,
      jobId: segment.jobId,
      position: segment.position,
      isMentored: segment.isMentored ?? false,
    })),
    absenceTypeId: snapshot.absenceTypeId ?? null,
    customStartTime: snapshot.customStartTime ?? null,
    customEndTime: snapshot.customEndTime ?? null,
    seriesId: snapshot.seriesId ?? null,
    fromRecurring: snapshot.fromRecurring ?? false,
  };
}

export function resolveScheduleCellSnapshotFromInput(
  input: ScheduleCellInput,
  options: {
    segmentCompatibility?: SegmentCompatibilityMaps | null;
    absenceTypeMap?: Map<number, string>;
  } = {},
): ScheduleCellSnapshot {
  if (input.kind === "deleted") {
    return buildDeletedSnapshot(input);
  }

  if (input.kind === "absence") {
    return buildScheduleCellSnapshot({
      kind: "absence",
      absenceTypeId: input.absenceTypeId ?? null,
      seriesId: input.seriesId ?? null,
      fromRecurring: input.fromRecurring ?? false,
      absenceTypeMap: options.absenceTypeMap,
    });
  }

  const orderedSegments = [...input.segments].sort((left, right) => left.position - right.position);

  const resolvedSegments =
    options.segmentCompatibility != null
      ? resolveShiftJobSegments(
          {
            shiftIds: orderedSegments.map((segment) => segment.shiftId),
            jobIds: orderedSegments.map((segment) => segment.jobId),
          },
          options.segmentCompatibility,
        ).map((segment, index): ScheduleCellSegmentSnapshot => ({
          ...segment,
          position: orderedSegments[index]?.position ?? index,
          isMentored: orderedSegments[index]?.isMentored ?? false,
        }))
      : orderedSegments.map((segment): ScheduleCellSegmentSnapshot => ({
          shiftId: segment.shiftId,
          jobId: segment.jobId,
          position: segment.position,
          label: "",
          assignmentId: null,
          shiftName: null,
          shiftAbbr: null,
          jobName: null,
          jobAbbr: null,
          focusAreaId: null,
          showJobOnGrid: false,
          isShiftless: segment.shiftId == null,
          isShiftOnly: false,
          isMentored: segment.isMentored ?? false,
          startTime: null,
          endTime: null,
        }));

  const assignmentIds =
    options.segmentCompatibility != null
      ? deriveAssignmentDefinitionIdsFromSegments(resolvedSegments, options.segmentCompatibility)
      : [];

  return buildScheduleCellSnapshot({
    kind: "worked",
    segments: resolvedSegments,
    assignmentIds,
    customStartTime: input.customStartTime ?? null,
    customEndTime: input.customEndTime ?? null,
    seriesId: input.seriesId ?? null,
    fromRecurring: input.fromRecurring ?? false,
  });
}

export function deriveAssignmentDefinitionIdsFromScheduleCellInput(
  input: ScheduleCellInput,
  segmentCompatibility?: SegmentCompatibilityMaps | null,
): number[] {
  if (input.kind !== "worked" || !segmentCompatibility) {
    return [];
  }

  return resolveScheduleCellSnapshotFromInput(input, {
    segmentCompatibility,
  }).assignmentIds;
}

export function buildScheduleCellEntryFromInput(args: {
  input: ScheduleCellInput;
  published: ScheduleCellSnapshot | null;
  segmentCompatibility?: SegmentCompatibilityMaps | null;
  absenceTypeMap?: Map<number, string>;
  draftKind: DraftKind;
  isScheduler?: boolean;
  isDelete?: boolean;
  version?: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}): ScheduleCellStateEntry | null {
  return buildScheduleCellEntry({
    draft: resolveScheduleCellSnapshotFromInput(args.input, {
      segmentCompatibility: args.segmentCompatibility,
      absenceTypeMap: args.absenceTypeMap,
    }),
    published: args.published,
    isScheduler: args.isScheduler ?? true,
    draftKind: args.draftKind,
    isDelete: args.isDelete ?? false,
    version: args.version,
    createdBy: args.createdBy ?? null,
    updatedBy: args.updatedBy ?? null,
    createdAt: args.createdAt ?? null,
    updatedAt: args.updatedAt ?? null,
  });
}

function normalizedSegmentsEqual(left: ScheduleCellSnapshot, right: ScheduleCellSnapshot): boolean {
  if (left.kind !== "worked" || right.kind !== "worked") {
    return left.kind === right.kind;
  }

  if (left.segments.length !== right.segments.length) {
    return false;
  }

  return left.segments.every((segment, index) => {
    const other = right.segments[index];
    return (
      other != null &&
      segment.position === other.position &&
      segment.shiftId === other.shiftId &&
      segment.jobId === other.jobId &&
      (segment.isMentored ?? false) === (other.isMentored ?? false)
    );
  });
}

export function classifyScheduleCellDraft(args: {
  draft: ScheduleCellSnapshot | null;
  published: ScheduleCellSnapshot | null;
}): DraftKind {
  const { draft, published } = args;

  if (!draft) return null;
  if (!published) {
    return draft.kind === "deleted" ? null : "new";
  }

  if (draft.kind === "deleted") {
    return "deleted";
  }

  const matchesPublished =
    draft.kind === published.kind &&
    draft.absenceTypeId === published.absenceTypeId &&
    draft.customStartTime === published.customStartTime &&
    draft.customEndTime === published.customEndTime &&
    normalizedSegmentsEqual(draft, published);

  return matchesPublished ? null : "modified";
}

export function buildScheduleCellEntry(args: {
  draft: ScheduleCellSnapshot | null;
  published: ScheduleCellSnapshot | null;
  isScheduler: boolean;
  draftKind: DraftKind;
  isDelete?: boolean;
  version?: number;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}): ScheduleCellStateEntry | null {
  const draft = cloneScheduleCellSnapshot(args.draft);
  const published = cloneScheduleCellSnapshot(args.published);
  const effective = cloneScheduleCellSnapshot(args.isScheduler ? (draft ?? published) : published);

  if (!hasSnapshotContent(effective)) {
    return null;
  }
  const effectiveSnapshot = effective;

  const effectiveLabel = effective?.kind === "deleted" ? "OFF" : (effective?.label ?? "");
  const publishedLabel = published?.kind === "deleted" ? "OFF" : (published?.label ?? "");

  return {
    draft,
    published,
    effective,
    label: effectiveLabel,
    segments: hasWorkedIdentity(effectiveSnapshot) ? cloneSegments(effectiveSnapshot.segments) : [],
    assignmentIds: effective?.kind === "worked" ? [...effective.assignmentIds] : [],
    isDraft: args.draftKind !== null,
    isDelete: args.isDelete ?? false,
    draftKind: args.draftKind,
    publishedAssignmentDefinitionIds:
      published?.kind === "worked" ? [...published.assignmentIds] : [],
    publishedSegments: hasWorkedIdentity(published) ? cloneSegments(published.segments) : [],
    publishedLabel,
    seriesId: effective?.seriesId ?? draft?.seriesId ?? published?.seriesId ?? null,
    fromRecurring:
      effective?.fromRecurring ?? draft?.fromRecurring ?? published?.fromRecurring ?? false,
    customStartTime: effective?.kind === "worked" ? (effective.customStartTime ?? null) : null,
    customEndTime: effective?.kind === "worked" ? (effective.customEndTime ?? null) : null,
    publishedCustomStartTime:
      published?.kind === "worked" ? (published.customStartTime ?? null) : null,
    publishedCustomEndTime: published?.kind === "worked" ? (published.customEndTime ?? null) : null,
    absenceTypeId: effective?.kind === "absence" ? (effective.absenceTypeId ?? null) : null,
    publishedAbsenceTypeId:
      published?.kind === "absence" ? (published.absenceTypeId ?? null) : null,
    version: args.version,
    createdBy: args.createdBy ?? null,
    updatedBy: args.updatedBy ?? null,
    createdAt: args.createdAt ?? null,
    updatedAt: args.updatedAt ?? null,
  };
}

export function cloneScheduleCellEntry(
  entry: ScheduleCellStateEntry | null | undefined,
): ScheduleCellStateEntry | null {
  if (!entry) return null;
  return {
    ...entry,
    draft: cloneScheduleCellSnapshot(entry.draft),
    published: cloneScheduleCellSnapshot(entry.published),
    effective: cloneScheduleCellSnapshot(entry.effective),
    segments: (entry.segments ?? []).map((segment) => ({ ...segment })),
    assignmentIds: [...entry.assignmentIds],
    publishedSegments: (entry.publishedSegments ?? []).map((segment) => ({
      ...segment,
    })),
    publishedAssignmentDefinitionIds: [...entry.publishedAssignmentDefinitionIds],
  };
}

function buildResolvedSegmentsFromNormalizedSnapshot(
  snapshot: DbScheduleCellSnapshot,
  options: Pick<
    ScheduleCellMapperOptions,
    "segmentCompatibility" | "assignmentLabelMap" | "assignmentIdByPair"
  >,
): ScheduleCellSegmentSnapshot[] {
  const orderedSegments = [...(snapshot.segments ?? [])].sort(
    (left, right) => left.position - right.position,
  );

  if (orderedSegments.length === 0) {
    return [];
  }

  if (!options.segmentCompatibility) {
    return orderedSegments.map((segment) => {
      const assignmentId =
        options.assignmentIdByPair?.get(
          buildShiftJobPairKey(segment.shift_id ?? null, segment.job_id),
        ) ?? null;

      return {
        assignmentId,
        label: assignmentId != null ? (options.assignmentLabelMap.get(assignmentId) ?? "") : "",
        shiftId: segment.shift_id ?? null,
        jobId: segment.job_id,
        position: segment.position,
        shiftName: null,
        shiftAbbr: null,
        jobName: null,
        jobAbbr: null,
        focusAreaId: null,
        showJobOnGrid: false,
        isShiftless: segment.shift_id == null,
        isShiftOnly: false,
        isMentored: segment.is_mentored ?? false,
        startTime: null,
        endTime: null,
      };
    });
  }

  return resolveShiftJobSegments(
    {
      shiftIds: orderedSegments.map((segment) => segment.shift_id ?? null),
      jobIds: orderedSegments.map((segment) => segment.job_id),
    },
    options.segmentCompatibility,
  ).map((segment, index) => ({
    ...segment,
    position: orderedSegments[index]?.position ?? index,
    isMentored: orderedSegments[index]?.is_mentored ?? false,
  }));
}

function buildScheduleCellSnapshotFromRecord(args: {
  cell: DbScheduleCell;
  snapshot: DbScheduleCellSnapshot | null | undefined;
  assignmentLabelMap: Map<number, string>;
  assignmentIdByPair?: Map<string, number>;
  absenceTypeMap?: Map<number, string>;
  segmentCompatibility?: SegmentCompatibilityMaps | null;
}): ScheduleCellSnapshot | null {
  const snapshot = args.snapshot;
  if (!snapshot) return null;

  if (snapshot.state_kind === "deleted") {
    return buildDeletedSnapshot({
      seriesId: args.cell.series_id ?? null,
      fromRecurring: args.cell.from_recurring ?? false,
    });
  }

  if (snapshot.state_kind === "absence") {
    return buildScheduleCellSnapshot({
      kind: "absence",
      absenceTypeId: snapshot.absence_type_id ?? null,
      seriesId: args.cell.series_id ?? null,
      fromRecurring: args.cell.from_recurring ?? false,
      absenceTypeMap: args.absenceTypeMap,
    });
  }

  const segments = buildResolvedSegmentsFromNormalizedSnapshot(snapshot, {
    segmentCompatibility: args.segmentCompatibility,
    assignmentLabelMap: args.assignmentLabelMap,
    assignmentIdByPair: args.assignmentIdByPair,
  });
  const assignmentIds =
    args.segmentCompatibility != null && segments.length > 0
      ? deriveAssignmentDefinitionIdsFromSegments(segments, args.segmentCompatibility)
      : segments
          .map((segment) => segment.assignmentId ?? null)
          .filter((value): value is number => value != null);

  return buildScheduleCellSnapshot({
    kind: "worked",
    segments,
    assignmentIds,
    customStartTime: snapshot.custom_start_time ?? null,
    customEndTime: snapshot.custom_end_time ?? null,
    seriesId: args.cell.series_id ?? null,
    fromRecurring: args.cell.from_recurring ?? false,
    assignmentLabelMap: args.assignmentLabelMap,
  });
}

export function mapNormalizedScheduleCellRowToScheduleEntry(
  row: DbScheduleCell,
  options: ScheduleCellMapperOptions,
): ScheduleCellStateEntry | null {
  const snapshots = row.snapshots ?? [];
  const draft = buildScheduleCellSnapshotFromRecord({
    cell: row,
    snapshot: snapshots.find((snapshot) => snapshot.snapshot_kind === "draft"),
    assignmentLabelMap: options.assignmentLabelMap,
    assignmentIdByPair: options.assignmentIdByPair,
    absenceTypeMap: options.absenceTypeMap,
    segmentCompatibility: options.segmentCompatibility,
  });
  const published = buildScheduleCellSnapshotFromRecord({
    cell: row,
    snapshot: snapshots.find((snapshot) => snapshot.snapshot_kind === "published"),
    assignmentLabelMap: options.assignmentLabelMap,
    assignmentIdByPair: options.assignmentIdByPair,
    absenceTypeMap: options.absenceTypeMap,
    segmentCompatibility: options.segmentCompatibility,
  });
  const draftKind = classifyScheduleCellDraft({ draft, published });

  return buildScheduleCellEntry({
    draft,
    published,
    isScheduler: options.isScheduler,
    draftKind,
    isDelete: draft?.kind === "deleted",
    version: row.version,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  });
}
