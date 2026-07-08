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
export type ResolvedSchedulePresentationSegment = z.infer<
  typeof resolvedSchedulePresentationSegmentSchema
>;
export type ResolvedSchedulePresentation = z.infer<typeof resolvedSchedulePresentationSchema>;
