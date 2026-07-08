export type ShiftDiffBorderKind = "new" | "modified" | null;

export type ShiftDiffBadgeKind = "new" | "modified" | "time";

export type ShiftDiffTimeRange = {
  start: string | null;
  end: string | null;
};

export type ShiftDiffState = {
  assignmentIds?: number[] | null;
  absenceTypeId?: number | null;
  timeRanges?: ShiftDiffTimeRange[] | null;
  isMentoredFlags?: boolean[] | null;
};

export type ShiftDiffBadgeDescriptor = {
  kind: ShiftDiffBadgeKind;
  text: string;
  detail: string;
};

export type ShiftPillDiffDescriptor = {
  borderKind: ShiftDiffBorderKind;
  badge: ShiftDiffBadgeDescriptor | null;
};

export type ShiftDiffDescriptorResult = {
  pillDiffs: ShiftPillDiffDescriptor[];
  cellBadge: ShiftDiffBadgeDescriptor | null;
};

type BuildShiftDiffDescriptorsInput = {
  before: ShiftDiffState;
  after: ShiftDiffState;
  resolveAssignmentDefinitionLabel?: (assignmentId: number) => string;
  resolveAbsenceLabel?: (absenceTypeId: number) => string;
  beforeShiftLabels?: Array<string | null | undefined>;
  afterShiftLabels?: Array<string | null | undefined>;
};

function resolveDiffLabel(input: BuildShiftDiffDescriptorsInput, assignmentId: number): string {
  return input.resolveAssignmentDefinitionLabel?.(assignmentId) ?? "?";
}

function normalizeTimeValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized.slice(0, 5);
}

function normalizeTimeRanges(
  timeRanges: ShiftDiffTimeRange[] | null | undefined,
  count: number,
): ShiftDiffTimeRange[] {
  return Array.from({ length: count }, (_, index) => {
    const range = timeRanges?.[index];
    return {
      start: normalizeTimeValue(range?.start),
      end: normalizeTimeValue(range?.end),
    };
  });
}

function normalizeBooleanFlags(flags: boolean[] | null | undefined, count: number): boolean[] {
  return Array.from({ length: count }, (_, index) => flags?.[index] ?? false);
}

function hasTimeRange(range: ShiftDiffTimeRange | undefined): boolean {
  return Boolean(range?.start || range?.end);
}

function formatTimeRange(range: ShiftDiffTimeRange | undefined): string {
  const start = normalizeTimeValue(range?.start);
  const end = normalizeTimeValue(range?.end);
  if (start && end) return `${start}-${end}`;
  return start ?? end ?? "";
}

function normalizeShiftLabelValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function resolveShiftLabelAtIndex(args: {
  assignmentIds: number[];
  shiftLabels?: Array<string | null | undefined>;
  index: number;
  resolveAssignmentDefinitionLabel: (assignmentId: number) => string;
}): string | null {
  const { assignmentIds, shiftLabels, index, resolveAssignmentDefinitionLabel } = args;
  const label = normalizeShiftLabelValue(shiftLabels?.[index]);
  if (label) return label;
  const assignmentId = assignmentIds[index];
  if (assignmentId == null) return null;
  return resolveAssignmentDefinitionLabel(assignmentId);
}

function resolveStateLabel(
  state: Required<Pick<ShiftDiffState, "assignmentIds" | "absenceTypeId">>,
  resolvers: Pick<
    BuildShiftDiffDescriptorsInput,
    "resolveAssignmentDefinitionLabel" | "resolveAbsenceLabel"
  >,
  shiftLabels?: Array<string | null | undefined>,
): string | null {
  if (state.absenceTypeId != null) {
    return resolvers.resolveAbsenceLabel?.(state.absenceTypeId) ?? "?";
  }
  const assignmentIds = state.assignmentIds ?? [];
  if (assignmentIds.length > 0) {
    return assignmentIds
      .map(
        (assignmentId, index) =>
          resolveShiftLabelAtIndex({
            assignmentIds,
            shiftLabels,
            index,
            resolveAssignmentDefinitionLabel:
              resolvers.resolveAssignmentDefinitionLabel ?? ((id) => id.toString()),
          }) ??
          resolvers.resolveAssignmentDefinitionLabel?.(assignmentId) ??
          assignmentId.toString(),
      )
      .join("/");
  }
  return null;
}

function buildTimeBadge(args: {
  before: ShiftDiffTimeRange | undefined;
  after: ShiftDiffTimeRange | undefined;
  label: string | null;
  includeLabel: boolean;
}): ShiftDiffBadgeDescriptor | null {
  const { before, after, label, includeLabel } = args;
  const hadTime = hasTimeRange(before);
  const hasTime = hasTimeRange(after);

  if (!hadTime && !hasTime) return null;

  const detailSuffix = includeLabel && label ? ` for ${label}` : "";
  const previousTime = formatTimeRange(before);
  const nextTime = formatTimeRange(after);

  if (!hadTime && hasTime) {
    return {
      kind: "time",
      text: "+ Time",
      detail: nextTime
        ? `Added custom time${detailSuffix} ${nextTime}.`
        : `Added custom time${detailSuffix}.`,
    };
  }

  if (hadTime && !hasTime) {
    return {
      kind: "time",
      text: "Time",
      detail: `Removed custom time${detailSuffix}.`,
    };
  }

  if (
    normalizeTimeValue(before?.start) === normalizeTimeValue(after?.start) &&
    normalizeTimeValue(before?.end) === normalizeTimeValue(after?.end)
  ) {
    return null;
  }

  return {
    kind: "time",
    text: "Time",
    detail:
      previousTime && nextTime
        ? `Changed custom time${detailSuffix} ${previousTime} to ${nextTime}.`
        : `Updated custom time${detailSuffix}.`,
  };
}

function buildNewShiftBadge(label: string): ShiftDiffBadgeDescriptor {
  return {
    kind: "new",
    text: "New",
    detail: `Added ${label}.`,
  };
}

function buildReplacementBadge(label: string): ShiftDiffBadgeDescriptor {
  return {
    kind: "modified",
    text: `Was ${label}`,
    detail: `Was ${label}.`,
  };
}

export function expandDelimitedTimeRanges(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  count: number,
): ShiftDiffTimeRange[] {
  const startParts = (startTime ?? "").split("|");
  const endParts = (endTime ?? "").split("|");

  return Array.from({ length: count }, (_, index) => ({
    start: normalizeTimeValue(startParts[index]),
    end: normalizeTimeValue(endParts[index]),
  }));
}

export function buildShiftDiffDescriptors(
  input: BuildShiftDiffDescriptorsInput,
): ShiftDiffDescriptorResult {
  const beforeAssignmentDefinitionIds = [...(input.before.assignmentIds ?? [])];
  const afterAssignmentDefinitionIds = [...(input.after.assignmentIds ?? [])];
  const beforeAbsenceTypeId = input.before.absenceTypeId ?? null;
  const afterAbsenceTypeId = input.after.absenceTypeId ?? null;
  const beforeTimeRanges = normalizeTimeRanges(
    input.before.timeRanges,
    beforeAssignmentDefinitionIds.length,
  );
  const afterTimeRanges = normalizeTimeRanges(
    input.after.timeRanges,
    afterAssignmentDefinitionIds.length,
  );
  const beforeIsMentoredFlags = normalizeBooleanFlags(
    input.before.isMentoredFlags,
    beforeAssignmentDefinitionIds.length,
  );
  const afterIsMentoredFlags = normalizeBooleanFlags(
    input.after.isMentoredFlags,
    afterAssignmentDefinitionIds.length,
  );
  const hasBeforeContent = beforeAbsenceTypeId != null || beforeAssignmentDefinitionIds.length > 0;
  const hasAfterContent = afterAbsenceTypeId != null || afterAssignmentDefinitionIds.length > 0;
  const usesMultiplePills =
    Math.max(beforeAssignmentDefinitionIds.length, afterAssignmentDefinitionIds.length) > 1;

  const pillDiffs = afterAssignmentDefinitionIds.map<ShiftPillDiffDescriptor>(
    (afterAssignmentDefinitionId, pillIndex) => {
      const afterLabel =
        resolveShiftLabelAtIndex({
          assignmentIds: afterAssignmentDefinitionIds,
          shiftLabels: input.afterShiftLabels,
          index: pillIndex,
          resolveAssignmentDefinitionLabel: (assignmentId) => resolveDiffLabel(input, assignmentId),
        }) ?? resolveDiffLabel(input, afterAssignmentDefinitionId);

      if (beforeAbsenceTypeId != null) {
        if (pillIndex === 0) {
          return {
            borderKind: "modified",
            badge: buildReplacementBadge(input.resolveAbsenceLabel?.(beforeAbsenceTypeId) ?? "?"),
          };
        }

        return {
          borderKind: "new",
          badge: buildNewShiftBadge(afterLabel),
        };
      }

      const beforeAssignmentDefinitionId = beforeAssignmentDefinitionIds[pillIndex];
      if (beforeAssignmentDefinitionId == null) {
        return {
          borderKind: "new",
          badge: buildNewShiftBadge(afterLabel),
        };
      }

      if (beforeAssignmentDefinitionId !== afterAssignmentDefinitionId) {
        return {
          borderKind: "modified",
          badge: buildReplacementBadge(
            resolveShiftLabelAtIndex({
              assignmentIds: beforeAssignmentDefinitionIds,
              shiftLabels: input.beforeShiftLabels,
              index: pillIndex,
              resolveAssignmentDefinitionLabel: (assignmentId) =>
                resolveDiffLabel(input, assignmentId),
            }) ?? resolveDiffLabel(input, beforeAssignmentDefinitionId),
          ),
        };
      }

      const timeBadge = buildTimeBadge({
        before: beforeTimeRanges[pillIndex],
        after: afterTimeRanges[pillIndex],
        label: afterLabel,
        includeLabel: usesMultiplePills,
      });
      const isMentoredChanged =
        beforeIsMentoredFlags[pillIndex] !== afterIsMentoredFlags[pillIndex];

      return {
        borderKind: timeBadge || isMentoredChanged ? "modified" : null,
        badge: timeBadge,
      };
    },
  );

  if (!hasAfterContent) {
    return {
      pillDiffs,
      cellBadge: null,
    };
  }

  if (afterAbsenceTypeId != null) {
    const beforeLabel = resolveStateLabel(
      {
        assignmentIds: beforeAssignmentDefinitionIds,
        absenceTypeId: beforeAbsenceTypeId,
      },
      {
        ...input,
        resolveAssignmentDefinitionLabel: (assignmentId) => resolveDiffLabel(input, assignmentId),
      },
      input.beforeShiftLabels,
    );

    if (!hasBeforeContent || !beforeLabel) {
      return {
        pillDiffs,
        cellBadge: {
          kind: "new",
          text: "New",
          detail: `Added ${input.resolveAbsenceLabel?.(afterAbsenceTypeId) ?? "?"}.`,
        },
      };
    }

    if (beforeAbsenceTypeId === afterAbsenceTypeId) {
      return {
        pillDiffs,
        cellBadge: null,
      };
    }

    return {
      pillDiffs,
      cellBadge: buildReplacementBadge(beforeLabel),
    };
  }

  const afterLabel = resolveStateLabel(
    {
      assignmentIds: afterAssignmentDefinitionIds,
      absenceTypeId: afterAbsenceTypeId,
    },
    {
      ...input,
      resolveAssignmentDefinitionLabel: (assignmentId) => resolveDiffLabel(input, assignmentId),
    },
    input.afterShiftLabels,
  );

  if (!hasBeforeContent) {
    return {
      pillDiffs,
      cellBadge: {
        kind: "new",
        text: "New",
        detail: `Added ${afterLabel ?? "shift"}.`,
      },
    };
  }

  const visibleActions = pillDiffs.flatMap((pillDiff) => (pillDiff.badge ? [pillDiff.badge] : []));
  const nonNewActions = visibleActions.filter((action) => action.kind !== "new");
  const removedDetails: string[] = [];

  if (
    beforeAbsenceTypeId == null &&
    beforeAssignmentDefinitionIds.length > afterAssignmentDefinitionIds.length
  ) {
    for (
      let index = afterAssignmentDefinitionIds.length;
      index < beforeAssignmentDefinitionIds.length;
      index += 1
    ) {
      removedDetails.push(
        `Removed ${
          resolveShiftLabelAtIndex({
            assignmentIds: beforeAssignmentDefinitionIds,
            shiftLabels: input.beforeShiftLabels,
            index,
            resolveAssignmentDefinitionLabel: (assignmentId) =>
              resolveDiffLabel(input, assignmentId),
          }) ?? resolveDiffLabel(input, beforeAssignmentDefinitionIds[index]!)
        }.`,
      );
    }
  }

  if (visibleActions.length === 0 && removedDetails.length === 0) {
    return {
      pillDiffs,
      cellBadge: null,
    };
  }

  if (
    nonNewActions.length === 1 &&
    visibleActions.length > nonNewActions.length &&
    removedDetails.length === 0
  ) {
    return {
      pillDiffs,
      cellBadge: {
        ...nonNewActions[0],
        detail: visibleActions.map((action) => action.detail).join(" "),
      },
    };
  }

  if (visibleActions.length === 1 && removedDetails.length === 0) {
    return {
      pillDiffs,
      cellBadge: visibleActions[0],
    };
  }

  return {
    pillDiffs,
    cellBadge: {
      kind: "modified",
      text: "Changed",
      detail: [...visibleActions.map((action) => action.detail), ...removedDetails].join(" "),
    },
  };
}
