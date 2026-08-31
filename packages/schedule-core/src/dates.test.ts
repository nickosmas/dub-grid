import { describe, expect, it } from "vitest";
import { formatLocalDateKey, parseLocalDateKey } from "./dates";

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
