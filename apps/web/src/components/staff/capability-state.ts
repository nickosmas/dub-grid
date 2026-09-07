interface ScheduleParticipation {
  focusAreaIds?: number[] | null;
}

/** A person is on the schedule only after their saved focus-area assignment exists. */
export function hasSavedScheduleAssignment(person: ScheduleParticipation): boolean {
  return (person.focusAreaIds?.length ?? 0) > 0;
}
