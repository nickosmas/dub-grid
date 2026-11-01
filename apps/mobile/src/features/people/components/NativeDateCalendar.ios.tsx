import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { useMobileColors } from "../../../shared/providers/ThemeModeProvider";
import type { NativeDateCalendarProps } from "./NativeDateCalendar";

export type { NativeDateCalendarProps } from "./NativeDateCalendar";

export const HAS_NATIVE_DATE_CALENDAR = true;

/** A calendar day at local noon, so no time zone moves it to a neighbour. */
function dayToDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

function dateToDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The system's own calendar, SwiftUI's graphical date picker in the tint
 * colour, under a date row as Calendar and Reminders open one (owner,
 * 2026-10-31). Days outside the range are the system's disabled days.
 */
export function NativeDateCalendar({ value, minDate, maxDate, onChange }: NativeDateCalendarProps) {
  const mobileColors = useMobileColors();
  return (
    <Host matchContents={{ vertical: true }}>
      <DatePicker
        displayedComponents={["date"]}
        modifiers={[datePickerStyle("graphical"), tint(mobileColors.brand)]}
        onDateChange={(date) => onChange(dateToDay(date))}
        range={{ start: dayToDate(minDate), end: maxDate ? dayToDate(maxDate) : undefined }}
        selection={dayToDate(value ?? minDate)}
      />
    </Host>
  );
}
