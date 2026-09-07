import { describe, expect, it } from "vitest";
import {
  addDaysToIsoDate,
  formatLocalDateKey,
  getIsoDateInTimeZone,
  getTimeZoneOffsetMinutes,
  getZonedDayRangeUtc,
  getZonedMidnightUtc,
  parseLocalDateKey,
} from "./dates";

const NEW_YORK = "America/New_York";

describe("parseLocalDateKey / formatLocalDateKey", () => {
  it("round-trips a key through parse then format unchanged", () => {
    for (const key of ["2026-01-01", "2026-08-23", "2026-12-31", "2024-02-29"]) {
      expect(formatLocalDateKey(parseLocalDateKey(key))).toBe(key);
    }
  });

  it("parses local calendar components matching the key, not UTC-shifted ones", () => {
    // Regression guard for the bug this pair replaced: a local-midnight Date
    // formatted back via `.toISOString()` shifts a full day backward on any
    // server timezone ahead of UTC. These assertions only pass if the parser
    // never routes through a UTC conversion.
    const date = parseLocalDateKey("2026-08-23");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7); // 0-indexed: August
    expect(date.getDate()).toBe(23);
  });

  it("formats a Date built from local calendar components without going through UTC", () => {
    expect(formatLocalDateKey(new Date(2026, 7, 23))).toBe("2026-08-23");
  });

  it("iterating with setDate stays on local calendar days across a range", () => {
    const start = parseLocalDateKey("2026-08-23");
    const end = parseLocalDateKey("2026-08-29");
    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      keys.push(formatLocalDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    expect(keys).toEqual([
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });
});

describe("getTimeZoneOffsetMinutes", () => {
  it("reports the offset that applies at the given instant", () => {
    expect(getTimeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), NEW_YORK)).toBe(-240);
    expect(getTimeZoneOffsetMinutes(new Date("2026-01-01T12:00:00Z"), NEW_YORK)).toBe(-300);
    expect(getTimeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "Asia/Tokyo")).toBe(540);
    expect(getTimeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), "UTC")).toBe(0);
  });

  it("ignores milliseconds rather than returning a fractional minute", () => {
    expect(getTimeZoneOffsetMinutes(new Date("2026-07-01T12:00:00.500Z"), NEW_YORK)).toBe(-240);
  });

  it("falls back to UTC for a missing timezone", () => {
    expect(getTimeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"), null)).toBe(0);
    expect(getTimeZoneOffsetMinutes(new Date("2026-07-01T12:00:00Z"))).toBe(0);
  });
});

describe("getZonedMidnightUtc", () => {
  it("resolves midnight behind and ahead of UTC", () => {
    expect(getZonedMidnightUtc("2026-09-06", NEW_YORK).toISOString()).toBe(
      "2026-09-06T04:00:00.000Z",
    );
    expect(getZonedMidnightUtc("2026-09-06", "Asia/Tokyo").toISOString()).toBe(
      "2026-09-05T15:00:00.000Z",
    );
    expect(getZonedMidnightUtc("2026-09-06", null).toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });

  it("uses the first instant of the day when local midnight is skipped", () => {
    // Santiago springs forward at 00:00 on this date, so 00:00 never happens.
    const midnight = getZonedMidnightUtc("2026-09-06", "America/Santiago");
    expect(midnight.toISOString()).toBe("2026-09-06T04:00:00.000Z");
    expect(getIsoDateInTimeZone(midnight, "America/Santiago")).toBe("2026-09-06");
  });

  it("lands on the correct instant either side of a DST change", () => {
    expect(getZonedMidnightUtc("2026-03-08", NEW_YORK).toISOString()).toBe(
      "2026-03-08T05:00:00.000Z",
    );
    expect(getZonedMidnightUtc("2026-03-09", NEW_YORK).toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
    expect(getZonedMidnightUtc("2026-11-01", NEW_YORK).toISOString()).toBe(
      "2026-11-01T04:00:00.000Z",
    );
    expect(getZonedMidnightUtc("2026-11-02", NEW_YORK).toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });
});

describe("getZonedDayRangeUtc", () => {
  it("covers a whole day in the zone, inclusive of the last millisecond", () => {
    expect(getZonedDayRangeUtc("2026-09-06", "2026-09-06", NEW_YORK)).toEqual({
      startAt: "2026-09-06T04:00:00.000Z",
      endAt: "2026-09-07T03:59:59.999Z",
    });
  });

  it("keeps a 23 hour spring-forward day and a 25 hour fall-back day whole", () => {
    expect(getZonedDayRangeUtc("2026-03-08", "2026-03-08", NEW_YORK)).toEqual({
      startAt: "2026-03-08T05:00:00.000Z",
      endAt: "2026-03-09T03:59:59.999Z",
    });
    expect(getZonedDayRangeUtc("2026-11-01", "2026-11-01", NEW_YORK)).toEqual({
      startAt: "2026-11-01T04:00:00.000Z",
      endAt: "2026-11-02T04:59:59.999Z",
    });
  });

  it("spans a week containing a DST change", () => {
    expect(getZonedDayRangeUtc("2026-03-08", "2026-03-14", NEW_YORK)).toEqual({
      startAt: "2026-03-08T05:00:00.000Z",
      endAt: "2026-03-15T03:59:59.999Z",
    });
  });

  it("falls back to UTC days when the organization has no timezone", () => {
    expect(getZonedDayRangeUtc("2026-09-06", "2026-09-06", null)).toEqual({
      startAt: "2026-09-06T00:00:00.000Z",
      endAt: "2026-09-06T23:59:59.999Z",
    });
  });

  it("produces contiguous ranges, so no event can fall between two days", () => {
    for (const timeZone of [NEW_YORK, "Asia/Tokyo", "Australia/Lord_Howe"]) {
      let date = "2026-01-01";
      for (let index = 0; index < 400; index += 1) {
        const next = addDaysToIsoDate(date, 1);
        const { endAt } = getZonedDayRangeUtc(date, date, timeZone);
        expect(Date.parse(endAt) + 1, `${timeZone} ${date}`).toBe(
          getZonedMidnightUtc(next, timeZone).getTime(),
        );
        date = next;
      }
    }
  });
});
