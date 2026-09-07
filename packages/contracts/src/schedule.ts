import { z } from "zod";

export const scheduleCellKindSchema = z.enum(["worked", "absence", "deleted"]);

export const scheduleCellSegmentSchema = z.object({
  shiftId: z.number().int().nullable(),
  jobId: z.number().int(),
  position: z.number().int().nonnegative(),
  isMentored: z.boolean().optional(),
});

export const scheduleCellStateSchema = z
  .object({
    kind: scheduleCellKindSchema,
    segments: z.array(scheduleCellSegmentSchema).default([]),
    focusAreaId: z.number().int().nullable().optional(),
    absenceTypeId: z.number().int().nullable().default(null),
    customStartTime: z.string().nullable().default(null),
    customEndTime: z.string().nullable().default(null),
    seriesId: z.string().nullable().default(null),
    fromRecurring: z.boolean().default(false),
  })
  .superRefine((state, ctx) => {
    if (state.kind === "worked") {
      if (state.segments.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Worked schedule cells require at least one segment",
          path: ["segments"],
        });
      }
      if (state.absenceTypeId != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Worked schedule cells cannot include an absence type",
          path: ["absenceTypeId"],
        });
      }
      return;
    }

    if (state.kind === "absence") {
      if (state.absenceTypeId == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Absence schedule cells require an absence type",
          path: ["absenceTypeId"],
        });
      }
      if (state.segments.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Absence schedule cells cannot include worked segments",
          path: ["segments"],
        });
      }
      return;
    }

    if (state.segments.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deleted schedule cells cannot include worked segments",
        path: ["segments"],
      });
    }
    if (state.absenceTypeId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Deleted schedule cells cannot include an absence type",
        path: ["absenceTypeId"],
      });
    }
  });

/**
 * A published note change, stored in a `schedule_publish_changes` row's
 * `to_state` (added) or `from_state` (removed).
 *
 * Notes live outside the schedule-cell snapshot system, so they have no cell
 * state to record. The `type` discriminator is what every reader of that table
 * filters on to keep note rows out of the shift-change paths. Indicator name
 * and colour are denormalized because a removed note still has to render after
 * its indicator type is archived.
 */
export const notePublishChangeStateSchema = z.object({
  type: z.literal("note"),
  indicatorTypeId: z.number().int(),
  focusAreaId: z.number().int().nullable(),
  indicatorName: z.string(),
  indicatorColor: z.string(),
});

export function isNotePublishChangeState(state: unknown): boolean {
  return (
    typeof state === "object" && state !== null && (state as { type?: unknown }).type === "note"
  );
}

/**
 * A saved recurring-schedule draft: employee id -> day of week -> cell state,
 * where null clears that day.
 *
 * Declared here rather than at the route because `z.record(key, value)` decides
 * which overload it was handed with `value instanceof ZodType`. A schema that
 * crosses a package boundary can carry a second copy of zod with it, that check
 * then reads false, and the record silently degrades to `Record<string, string>`
 * and rejects every real draft as invalid input. Building the whole record with
 * one zod keeps the check honest.
 */
export const recurringScheduleDraftSchema = z.record(
  z.string(),
  z.record(z.string(), scheduleCellStateSchema.nullable()),
);

export const resolvedSchedulePresentationSegmentSchema = z.object({
  shiftId: z.number().int().nullable().optional(),
  jobId: z.number().int().nullable().optional(),
  label: z.string().optional(),
  shiftName: z.string().nullable().optional(),
  jobName: z.string().nullable().optional(),
  jobSortOrder: z.number().int().nullable().optional(),
  jobColor: z.string().nullable().optional(),
  jobBorderColor: z.string().nullable().optional(),
  jobTextColor: z.string().nullable().optional(),
  shiftStartTime: z.string().nullable().optional(),
  shiftEndTime: z.string().nullable().optional(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  defaultDurationHours: z.number().nullable().optional(),
  defaultDurationMinutes: z.number().nullable().optional(),
  breakMinutes: z.number().int().nonnegative().nullable().optional(),
  focusAreaId: z.number().int().nullable().optional(),
  displayFocusAreaName: z.string().nullable().optional(),
  isMentored: z.boolean().optional(),
});

export const resolvedSchedulePresentationSchema = z.object({
  label: z.string(),
  shiftName: z.string().nullable().optional(),
  focusAreaId: z.number().int().nullable().optional(),
  focusAreaName: z.string().nullable().optional(),
  displayFocusAreaName: z.string().nullable().optional(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  shiftColor: z.string().nullable().optional(),
  shiftBorderColor: z.string().nullable().optional(),
  shiftTextColor: z.string().nullable().optional(),
  segments: z.array(resolvedSchedulePresentationSegmentSchema).default([]),
});

export type ScheduleCellKind = z.infer<typeof scheduleCellKindSchema>;
export type ScheduleCellSegment = z.infer<typeof scheduleCellSegmentSchema>;
export type ScheduleCellState = z.infer<typeof scheduleCellStateSchema>;
export type NotePublishChangeState = z.infer<typeof notePublishChangeStateSchema>;
export type RecurringScheduleDraftPayload = z.infer<typeof recurringScheduleDraftSchema>;
export type ResolvedSchedulePresentationSegment = z.infer<
  typeof resolvedSchedulePresentationSegmentSchema
>;
export type ResolvedSchedulePresentation = z.infer<typeof resolvedSchedulePresentationSchema>;
