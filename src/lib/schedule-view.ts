export type ScheduleSpan = 1 | 2 | "month";

export function resolveScheduleSpan(
  preferredSpan: ScheduleSpan,
  shouldAutoUseOneWeek: boolean,
): ScheduleSpan {
  return shouldAutoUseOneWeek && preferredSpan === 2 ? 1 : preferredSpan;
}
