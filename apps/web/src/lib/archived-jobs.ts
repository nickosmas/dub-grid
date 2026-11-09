import type { JobDefinition, ScheduleCellInput } from "@/types";

/** Shown when a write would put an archived job on a cell that doesn't hold it (130). */
export const ARCHIVED_JOB_MESSAGE =
  "That job is archived. Shifts that already have it keep it, but it can't be added to another shift.";

/** The start of the database's refusal (130), to recognize it. */
export const ARCHIVED_JOB_REFUSAL = "An archived job stays on the shifts that already have it";

/** Whether a job id names an archived job. An id the list doesn't hold reads as active. */
export function jobIdIsArchived(
  jobs: ReadonlyArray<Pick<JobDefinition, "id" | "archivedAt">>,
): (jobId: number | null | undefined) => boolean {
  const archived = new Set(jobs.filter((job) => job.archivedAt).map((job) => job.id));
  return (jobId) => jobId != null && archived.has(jobId);
}

/**
 * Whether writing `input` adds a segment whose job `isKeptOnly` names, that
 * the cell doesn't already hold in its draft or published schedule. A cell
 * keeps such a job; it can't move or be copied to another.
 */
export function addsJobKeptOnlyWhereHeld(
  input: ScheduleCellInput,
  held: ReadonlyArray<{ shiftId: number | null; jobId: number }>,
  isKeptOnly: (jobId: number) => boolean,
): boolean {
  if (input.kind !== "worked") return false;
  return input.segments.some(
    (segment) =>
      isKeptOnly(segment.jobId) &&
      !held.some(
        (existing) =>
          existing.jobId === segment.jobId &&
          (existing.shiftId ?? null) === (segment.shiftId ?? null),
      ),
  );
}
