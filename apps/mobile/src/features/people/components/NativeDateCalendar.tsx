export type NativeDateCalendarProps = {
  /** The chosen day (YYYY-MM-DD), or null for none yet. */
  value: string | null;
  minDate: string;
  maxDate?: string | null;
  onChange: (date: string) => void;
};

/** Whether this platform has a system calendar for a date row (iOS). */
export const HAS_NATIVE_DATE_CALENDAR = false;

/** Only iOS has one; elsewhere the date row keeps the app's month grid. */
export function NativeDateCalendar(_props: NativeDateCalendarProps) {
  return null;
}
