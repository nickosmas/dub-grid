import { classifyPersistedDraftShift } from "@/lib/draft-utils";
import type { ShiftMap } from "@/types";
import type { DbShift } from "./types";

type ShiftRowMapperOptions = {
  isScheduler: boolean;
  shiftCodeMap: Map<number, string>;
  absenceTypeMap?: Map<number, string>;
};

function resolveCodeLabels(
  ids: number[],
  codeMap: Map<number, string>,
): string {
  return ids.map((id) => codeMap.get(id) ?? "?").join("/");
}

export function mapDbShiftRowToShiftEntry(
  row: DbShift,
  options: ShiftRowMapperOptions,
): ShiftMap[string] | null {
  const { isScheduler, shiftCodeMap } = options;
  const absenceTypeMap = options.absenceTypeMap ?? new Map<number, string>();

  const draftIds = row.draft_shift_code_ids ?? [];
  const pubIds = row.published_shift_code_ids ?? [];
  const draftAbsId = row.draft_absence_type_id ?? null;
  const pubAbsId = row.published_absence_type_id ?? null;
  const draftStartTime = row.draft_custom_start_time ?? null;
  const draftEndTime = row.draft_custom_end_time ?? null;
  const pubStartTime = row.published_custom_start_time ?? null;
  const pubEndTime = row.published_custom_end_time ?? null;
  const hasDraftIdentity =
    draftIds.length > 0 || draftAbsId != null || row.draft_is_delete;

  const effectiveIds = isScheduler
    ? (hasDraftIdentity ? draftIds : pubIds)
    : pubIds;
  const effectiveAbsId = isScheduler
    ? (hasDraftIdentity ? draftAbsId : pubAbsId)
    : pubAbsId;
  const effectiveStartTime = isScheduler
    ? (draftStartTime ?? pubStartTime)
    : pubStartTime;
  const effectiveEndTime = isScheduler
    ? (draftEndTime ?? pubEndTime)
    : pubEndTime;
  const draftKind = classifyPersistedDraftShift(row);
  const isDraft = draftKind !== null;

  const publishedLabel = pubAbsId != null
    ? (absenceTypeMap.get(pubAbsId) ?? "?")
    : pubIds.length > 0
      ? resolveCodeLabels(pubIds, shiftCodeMap)
      : "";

  const hasContent =
    effectiveIds.length > 0
    || effectiveAbsId != null
    || (isScheduler && draftKind === "deleted");

  if (!hasContent) return null;

  const label = draftKind === "deleted" && isScheduler
    ? "OFF"
    : effectiveAbsId != null
      ? (absenceTypeMap.get(effectiveAbsId) ?? "?")
      : resolveCodeLabels(effectiveIds, shiftCodeMap);

  return {
    label,
    shiftCodeIds: effectiveIds,
    isDraft,
    isDelete: row.draft_is_delete,
    draftKind,
    publishedShiftCodeIds: pubIds,
    publishedLabel,
    absenceTypeId: effectiveAbsId,
    publishedAbsenceTypeId: pubAbsId,
    seriesId: row.series_id ?? null,
    fromRecurring: row.from_recurring ?? false,
    customStartTime: effectiveStartTime,
    customEndTime: effectiveEndTime,
    publishedCustomStartTime: pubStartTime,
    publishedCustomEndTime: pubEndTime,
    version: row.version,
    createdBy: row.created_by ?? null,
    updatedBy: row.updated_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
