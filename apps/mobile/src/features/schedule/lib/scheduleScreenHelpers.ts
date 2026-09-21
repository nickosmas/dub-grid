import type { GestureResponderEvent } from "react-native";
import type { MobileScheduleEntry, MobileScheduleEntrySegment } from "@dubgrid/contracts";

export const WEEK_SWIPE_FALLBACK_WIDTH = 360;
export const WEEK_SWIPE_MIN_THRESHOLD = 96;
export const WEEK_SWIPE_THRESHOLD_RATIO = 0.3;
export const WEEK_SWIPE_FLICK_MIN_DISTANCE = 24;
export const WEEK_SWIPE_FLICK_VELOCITY = 0.45;

export type ShiftTimeRange = {
  start: string;
  end: string;
};

export function getTimePartsInTimeZone(
  value: Date,
  timeZone?: string | null,
): { hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? "UTC",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // Not `hour12: false`: some engines render midnight as "24".
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(value);

  return {
    hour: Number(parts.find((part) => part.type === "hour")?.value ?? "0"),
    minute: Number(parts.find((part) => part.type === "minute")?.value ?? "0"),
    second: Number(parts.find((part) => part.type === "second")?.value ?? "0"),
  };
}

export function getCurrentTimeValue(value: Date, timeZone?: string | null): string {
  const parts = getTimePartsInTimeZone(value, timeZone);

  return `${`${parts.hour}`.padStart(2, "0")}:${`${parts.minute}`.padStart(2, "0")}:${`${parts.second}`.padStart(2, "0")}`;
}

export function getMinutesSinceMidnight(value: string): number | null {
  const [rawHours, rawMinutes] = value.split(":");
  const hours = Number(rawHours);
  const minutes = Number(rawMinutes);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

export function expandTimeRange(range: ShiftTimeRange): Array<{ start: number; end: number }> {
  const startMinutes = getMinutesSinceMidnight(range.start);
  const endMinutes = getMinutesSinceMidnight(range.end);

  if (startMinutes == null || endMinutes == null) {
    return [];
  }

  if (endMinutes <= startMinutes) {
    return [
      { start: startMinutes, end: 24 * 60 },
      { start: 0, end: endMinutes },
    ];
  }

  return [{ start: startMinutes, end: endMinutes }];
}

export type HeroTiming = {
  label: string;
  progress: number | null;
};

export function getSegmentStartTime(
  segment: MobileScheduleEntrySegment | null | undefined,
): string | null {
  return segment?.startTime ?? segment?.shiftStartTime ?? null;
}

export function getSegmentEndTime(
  segment: MobileScheduleEntrySegment | null | undefined,
): string | null {
  return segment?.endTime ?? segment?.shiftEndTime ?? null;
}

export function formatDurationValue(totalMinutes: number): string {
  const minutes = Math.max(totalMinutes, 0);
  const daysPart = Math.floor(minutes / (24 * 60));
  const remainingDayMinutes = minutes % (24 * 60);
  const hoursPart = Math.floor(remainingDayMinutes / 60);
  const minutesPart = remainingDayMinutes % 60;

  if (daysPart > 0) {
    return hoursPart > 0 ? `${daysPart}d ${hoursPart}h` : `${daysPart}d`;
  }

  if (hoursPart === 0) {
    return `${minutesPart}m`;
  }

  if (minutesPart === 0) {
    return `${hoursPart}h`;
  }

  return `${hoursPart}h ${minutesPart}m`;
}

export function formatDurationLabel(totalMinutes: number): string {
  return `${formatDurationValue(totalMinutes)} left`;
}

export function getIsoDateOrdinal(value: string): number | null {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.floor(timestamp / (24 * 60 * 60 * 1000));
}

export function getLocalDateTimeMinutes(date: string, time: string): number | null {
  const dateOrdinal = getIsoDateOrdinal(date);
  const timeMinutes = getMinutesSinceMidnight(time);

  if (dateOrdinal == null || timeMinutes == null) {
    return null;
  }

  return dateOrdinal * 24 * 60 + timeMinutes;
}

export function getStartingInLabel(input: {
  currentDate: string;
  currentTime: string;
  shiftDate: string;
  shiftStartTime: string | null;
}): string | null {
  if (!input.shiftStartTime) {
    return null;
  }

  const shiftStartMinutes = getLocalDateTimeMinutes(input.shiftDate, input.shiftStartTime);
  const currentMinutes = getLocalDateTimeMinutes(input.currentDate, input.currentTime);

  if (shiftStartMinutes == null || currentMinutes == null) {
    return null;
  }

  return `Starting in ${formatDurationValue(shiftStartMinutes - currentMinutes)}`;
}

export function getHeroTiming(
  entry: MobileScheduleEntry | null,
  segmentStartTime: string | null,
  segmentEndTime: string | null,
  status: "active" | "upcoming" | "scheduled" | "away" | "empty",
  currentDate: string,
  currentTime: string,
): HeroTiming | null {
  if (!entry || !segmentStartTime || status === "away" || status === "empty") {
    return null;
  }

  const segmentStartMinutes = getLocalDateTimeMinutes(entry.date, segmentStartTime);
  const currentMinutes = getLocalDateTimeMinutes(currentDate, currentTime);

  if (segmentStartMinutes == null || currentMinutes == null) {
    return null;
  }

  if (currentMinutes < segmentStartMinutes) {
    const startingInLabel = getStartingInLabel({
      currentDate,
      currentTime,
      shiftDate: entry.date,
      shiftStartTime: segmentStartTime,
    });

    return startingInLabel ? { label: startingInLabel, progress: null } : null;
  }

  if (!segmentEndTime) {
    return null;
  }

  const segmentEndMinutes = getLocalDateTimeMinutes(entry.date, segmentEndTime);

  if (segmentEndMinutes == null) {
    return null;
  }

  const normalizedEndMinutes =
    segmentEndMinutes <= segmentStartMinutes ? segmentEndMinutes + 24 * 60 : segmentEndMinutes;

  if (currentMinutes < segmentStartMinutes || currentMinutes >= normalizedEndMinutes) {
    return null;
  }

  const totalMinutes = normalizedEndMinutes - segmentStartMinutes;
  const elapsedMinutes = Math.min(Math.max(currentMinutes - segmentStartMinutes, 0), totalMinutes);

  if (totalMinutes <= 0) {
    return null;
  }

  return {
    progress: elapsedMinutes / totalMinutes,
    label: formatDurationLabel(normalizedEndMinutes - currentMinutes),
  };
}

export function formatHoursValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

export function getSwipeEventX(event: GestureResponderEvent): number | null {
  const nativeEvent = event.nativeEvent;
  const webNativeEvent = nativeEvent as typeof nativeEvent & {
    changedTouches?: Array<{ pageX?: number }>;
    touches?: Array<{ pageX?: number }>;
  };

  if (typeof nativeEvent.pageX === "number") {
    return nativeEvent.pageX;
  }

  const changedTouchX = webNativeEvent.changedTouches?.[0]?.pageX;
  if (typeof changedTouchX === "number") {
    return changedTouchX;
  }

  const touchX = webNativeEvent.touches?.[0]?.pageX;
  if (typeof touchX === "number") {
    return touchX;
  }

  return null;
}

export function getSwipeEventTimestamp(event: GestureResponderEvent): number | null {
  const nativeEvent = event.nativeEvent;
  const webNativeEvent = nativeEvent as typeof nativeEvent & {
    timeStamp?: number;
  };
  const webEvent = event as GestureResponderEvent & {
    timeStamp?: number;
    timestamp?: number;
  };
  const timestamp =
    nativeEvent.timestamp ?? webNativeEvent.timeStamp ?? webEvent.timestamp ?? webEvent.timeStamp;

  return typeof timestamp === "number" ? timestamp : null;
}

export function getWeekSwipeThreshold(width: number): number {
  return Math.max(WEEK_SWIPE_MIN_THRESHOLD, width * WEEK_SWIPE_THRESHOLD_RATIO);
}

export function clampWeekSwipeDelta(value: number, width: number): number {
  if (width <= 0) {
    return value;
  }

  return Math.max(-width, Math.min(width, value));
}

export function isCommittedWeekSwipe(input: {
  deltaX: number;
  elapsedMs: number | null;
  width: number;
}): boolean {
  const distance = Math.abs(input.deltaX);

  if (distance >= getWeekSwipeThreshold(input.width)) {
    return true;
  }

  if (input.elapsedMs == null || input.elapsedMs <= 0) {
    return false;
  }

  return (
    distance >= WEEK_SWIPE_FLICK_MIN_DISTANCE &&
    distance / input.elapsedMs >= WEEK_SWIPE_FLICK_VELOCITY
  );
}
