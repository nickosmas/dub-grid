import { describe, it, expect } from "vitest";
import { getWeekStart } from "@/lib/utils";

describe("getWeekStart", () => {
  it("returns the same day at midnight when given a Sunday", () => {
    // 2024-01-07 is a Sunday
    const sunday = new Date(2024, 0, 7, 14, 30, 45, 123);
    const result = getWeekStart(sunday);

    expect(result.getDay()).toBe(0);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(7);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it("returns the preceding Sunday at midnight when given a Wednesday", () => {
    // 2024-01-10 is a Wednesday; preceding Sunday is 2024-01-07
    const wednesday = new Date(2024, 0, 10);
    const result = getWeekStart(wednesday);

    expect(result.getDay()).toBe(0);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(7);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

import * as fc from "fast-check";

const arbDate = fc.date({ min: new Date("2000-01-01"), max: new Date("2099-12-31") }).filter(
  (d) => !isNaN(d.getTime()),
);

describe("getWeekStart — property tests", () => {
  // Feature: comprehensive-test-suite, Property 1: getWeekStart returns a Sunday with zeroed time
  // Validates: Requirements 2.1, 2.2
  it("always returns a Sunday with zeroed time components", () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        const result = getWeekStart(date);
        expect(result.getDay()).toBe(0);
        expect(result.getHours()).toBe(0);
        expect(result.getMinutes()).toBe(0);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
      }),
    );
  });

  // Feature: comprehensive-test-suite, Property 2: getWeekStart result is within 6 days of input
  // Validates: Requirements 2.4
  it("result is never after the input and never more than 6 days before it", () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        const weekStart = getWeekStart(date);
        // Use calendar-day difference (not ms / 86400000) to avoid DST edge cases
        // where a day may have 23 or 25 hours.
        const inputMidnight = new Date(date);
        inputMidnight.setHours(0, 0, 0, 0);
        const diffDays = Math.round((inputMidnight.getTime() - weekStart.getTime()) / 86_400_000);
        expect(diffDays).toBeGreaterThanOrEqual(0);
        expect(diffDays).toBeLessThanOrEqual(6);
      }),
    );
  });
});

import { addDays } from "@/lib/utils";

describe("addDays", () => {
  // Requirements: 3.1, 3.2
  it("returns midnight of the same day when offset is 0", () => {
    const result = addDays(new Date(2024, 0, 10, 15, 30, 45, 999), 0);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(10);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  // Requirements: 3.2
  it("returns Jan 15 2024 at midnight when adding 5 days to Jan 10 2024", () => {
    const result = addDays(new Date(2024, 0, 10), 5);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(15);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  // Requirements: 3.2, 3.4
  it("returns Jan 7 2024 at midnight when subtracting 3 days from Jan 10 2024", () => {
    const result = addDays(new Date(2024, 0, 10), -3);
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(7);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });
});

describe("addDays — property tests", () => {
  // Feature: comprehensive-test-suite, Property 3: addDays round-trip with zeroed time
  // Validates: Requirements 3.1, 3.3
  it("round-trip: addDays(addDays(d, n), -n) equals addDays(d, 0), and result always has zeroed time", () => {
    fc.assert(
      fc.property(arbDate, fc.integer({ min: -365, max: 365 }), (date, n) => {
        const forward = addDays(date, n);
        const roundTrip = addDays(forward, -n);
        const zeroed = addDays(date, 0);

        // Round-trip must equal the date zeroed to midnight
        expect(roundTrip).toEqual(zeroed);

        // addDays result must always have zeroed time components
        expect(forward.getHours()).toBe(0);
        expect(forward.getMinutes()).toBe(0);
        expect(forward.getSeconds()).toBe(0);
        expect(forward.getMilliseconds()).toBe(0);
      }),
    );
  });

  // Feature: comprehensive-test-suite, Property 4: addDays produces an exact n-day difference
  // Validates: Requirements 3.4
  it("difference in calendar days between addDays(d, n) and addDays(d, 0) equals exactly n", () => {
    fc.assert(
      fc.property(arbDate, fc.integer({ min: -365, max: 365 }), (date, n) => {
        const base = addDays(date, 0);
        const shifted = addDays(date, n);
        // Compare calendar days using date components to avoid DST issues
        const baseDay = base.getFullYear() * 10000 + base.getMonth() * 100 + base.getDate();
        const shiftedDay = shifted.getFullYear() * 10000 + shifted.getMonth() * 100 + shifted.getDate();
        // Use millisecond diff but round to nearest day to handle DST transitions
        const diffMs = shifted.getTime() - base.getTime();
        const diffDays = Math.round(diffMs / 86_400_000);
        expect(diffDays).toBe(n);
      }),
    );
  });
});

import { formatDate, formatDateKey } from "@/lib/utils";

describe("formatDate", () => {
  // Requirements: 4.1
  it("formats Jan 5 as '1/5' (no leading zeros)", () => {
    expect(formatDate(new Date(2024, 0, 5))).toBe("1/5");
  });

  it("formats Dec 31 as '12/31'", () => {
    expect(formatDate(new Date(2024, 11, 31))).toBe("12/31");
  });
});

describe("formatDateKey", () => {
  // Requirements: 4.2
  it("formats Jan 5 2024 as '2024-01-05' (zero-padded)", () => {
    expect(formatDateKey(new Date(2024, 0, 5))).toBe("2024-01-05");
  });

  it("formats Dec 31 2024 as '2024-12-31'", () => {
    expect(formatDateKey(new Date(2024, 11, 31))).toBe("2024-12-31");
  });

  // Requirements: 4.3, 4.4 — no UTC shift at midnight local time
  it("uses local date components for midnight local time (no UTC shift)", () => {
    // midnight local — would shift to previous day under UTC in negative-offset timezones
    const midnight = new Date(2024, 0, 5, 0, 0, 0, 0);
    expect(formatDateKey(midnight)).toBe("2024-01-05");
  });
});

describe("formatDateKey and formatDate — property tests", () => {
  // Feature: comprehensive-test-suite, Property 5: formatDateKey format and local date components
  // Validates: Requirements 4.2, 4.3, 4.4
  it("formatDateKey matches YYYY-MM-DD and reflects local month and day", () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        const key = formatDateKey(date);
        expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const [, mm, dd] = key.split("-").map(Number);
        expect(mm).toBe(date.getMonth() + 1);
        expect(dd).toBe(date.getDate());
      }),
    );
  });

  // Feature: comprehensive-test-suite, Property 6: formatDate produces an M/D string
  // Validates: Requirements 4.1
  it("formatDate matches M/D with no leading zeros", () => {
    fc.assert(
      fc.property(arbDate, (date) => {
        expect(formatDate(date)).toMatch(/^\d{1,2}\/\d{1,2}$/);
      }),
    );
  });
});

import { getInitials } from "@/lib/utils";

describe("getInitials", () => {
  // Requirements: 5.1
  it("returns first initials of first and last word for a two-word name", () => {
    expect(getInitials("Jane Doe")).toBe("JD");
  });

  // Requirements: 5.2
  it("returns first two characters uppercased for a single-word name", () => {
    expect(getInitials("Madonna")).toBe("MA");
  });

  // Requirements: 5.3
  it("returns empty string for an empty string input", () => {
    expect(getInitials("")).toBe("");
  });

  // Requirements: 5.1 — extra spaces are collapsed; first and last word initials used
  it("handles names with extra surrounding and internal spaces", () => {
    expect(getInitials("  Jane  Doe  ")).toBe("JD");
  });
});

describe("getInitials — property tests", () => {
  // Feature: comprehensive-test-suite, Property 7: getInitials returns only uppercase characters
  // Validates: Requirements 5.1, 5.2, 5.4
  it("returns a non-empty string of only uppercase letters for any name containing at least one letter", () => {
    const arbNameWithLetter = fc.string().filter(
      (s) => s.trim().length > 0 && /[a-zA-Z]/.test(s),
    );
    fc.assert(
      fc.property(arbNameWithLetter, (name) => {
        const result = getInitials(name);
        expect(result.length).toBeGreaterThan(0);
        expect(result).toMatch(/^[A-Z]+$/);
      }),
    );
  });
});

// ── PostgREST filter sanitization ─────────────────────────────────────────

import { assertSafeFilterValue } from "@/lib/db";

describe("assertSafeFilterValue", () => {
  it("allows valid UUIDs", () => {
    expect(() => assertSafeFilterValue("a1b2c3d4-e5f6-7890-abcd-ef1234567890", "id")).not.toThrow();
  });

  it("allows date strings", () => {
    expect(() => assertSafeFilterValue("2024-01-15", "date")).not.toThrow();
  });

  it("rejects values with parentheses (PostgREST operator injection)", () => {
    expect(() => assertSafeFilterValue("abc),requester_emp_id.gt.(0", "id")).toThrow(/Unsafe/);
  });

  it("rejects values with commas", () => {
    expect(() => assertSafeFilterValue("a,b", "id")).toThrow(/Unsafe/);
  });

  it("rejects values with dots (PostgREST field separator)", () => {
    expect(() => assertSafeFilterValue("a.eq.b", "id")).toThrow(/Unsafe/);
  });

  it("rejects values with double quotes", () => {
    expect(() => assertSafeFilterValue('a"b', "id")).toThrow(/Unsafe/);
  });

  it("rejects values with backslashes", () => {
    expect(() => assertSafeFilterValue("a\\b", "id")).toThrow(/Unsafe/);
  });

  it("allows simple alphanumeric strings with dashes", () => {
    expect(() => assertSafeFilterValue("simple-value-123", "id")).not.toThrow();
  });
});
