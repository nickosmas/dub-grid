import type { MobileOpenShift, MobileScheduleEntry } from "@dubgrid/contracts";
import { addDaysToIsoDate, getIsoDateInTimeZone } from "../../../schedule/lib/schedule";

/**
 * What the tour's previews show. The tour runs before sign-in, so there is
 * no organization, no schedule and no clock to read from; this stands in
 * for a published week at a care facility.
 */

/** The device's own day: there is no organization time zone yet. */
export function getPreviewToday(): string {
  return getIsoDateInTimeZone(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * Frozen mid-shift rather than read from the clock, so the hero reads as on
 * duty with a progress bar and time left whatever hour the tour is opened
 * at. 9:41 is the hour every Apple status bar shows.
 */
export const PREVIEW_TIME = "09:41:00";
export const PREVIEW_EMPLOYEE_ID = "preview-you";

const DAY_SHIFT_START = "07:00:00";
const DAY_SHIFT_END = "15:30:00";

function buildDayShiftPresentation(focusAreaId: number, focusAreaName: string) {
  return {
    label: "Day Shift",
    shiftName: "Day Shift",
    focusAreaId,
    focusAreaName,
    displayFocusAreaName: focusAreaName,
    startTime: DAY_SHIFT_START,
    endTime: DAY_SHIFT_END,
    segments: [
      {
        shiftId: 1,
        jobId: 1,
        shiftName: "Day Shift",
        shiftStartTime: DAY_SHIFT_START,
        shiftEndTime: DAY_SHIFT_END,
        startTime: DAY_SHIFT_START,
        endTime: DAY_SHIFT_END,
        focusAreaId,
        displayFocusAreaName: focusAreaName,
      },
    ],
  };
}

const WORKED_DAY_SHIFT: MobileScheduleEntry["state"] = {
  kind: "worked",
  segments: [{ shiftId: 1, jobId: 1, position: 0 }],
  absenceTypeId: null,
  customStartTime: null,
  customEndTime: null,
  seriesId: null,
  fromRecurring: false,
};

export function buildPreviewScheduleEntry(
  employeeId: string,
  employeeName: string,
  date: string,
): MobileScheduleEntry {
  return {
    employeeId,
    employeeName,
    employeeFocusAreaIds: [1],
    date,
    state: WORKED_DAY_SHIFT,
    presentation: buildDayShiftPresentation(1, "Sheltered Care"),
    change: null,
    publishedAt: null,
    publishedByName: null,
  };
}

/** Three initials in the stack and one more behind them. */
export const PREVIEW_SHIFTMATES: ReadonlyArray<readonly [id: string, name: string]> = [
  ["preview-chloe", "Chloe Park"],
  ["preview-ethan", "Ethan Hall"],
  ["preview-quinn", "Quinn Morales"],
  ["preview-ava", "Ava Nguyen"],
];

export function buildPreviewOpenShift(today: string): MobileOpenShift {
  return {
    id: "preview-open-shift",
    date: addDaysToIsoDate(today, 1),
    focusAreaId: 2,
    focusAreaName: "Skilled Nursing",
    needed: 1,
    urgency: null,
    state: WORKED_DAY_SHIFT,
    presentation: buildDayShiftPresentation(2, "Skilled Nursing"),
    canVolunteer: true,
    volunteerBlockReason: null,
  };
}
