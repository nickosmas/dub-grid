import { describe, expect, it } from "vitest";
import { bucketAuditDays } from "./day-counts";

const NEW_YORK = "America/New_York";

describe("bucketAuditDays", () => {
  it("counts events per calendar day in the organization's zone", () => {
    const result = bucketAuditDays(
      [
        { created_at: "2026-09-06T14:00:00.000Z" },
        { created_at: "2026-09-06T18:00:00.000Z" },
        { created_at: "2026-09-04T14:00:00.000Z" },
      ],
      NEW_YORK,
      5000,
    );

    expect(result.counts).toEqual({ "2026-09-06": 2, "2026-09-04": 1 });
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it("files a late-evening event under the organization's day, not UTC's", () => {
    // 10:30 PM on Sep 5 in New York, already Sep 6 in UTC.
    const rows = [{ created_at: "2026-09-06T02:30:00.000Z" }];

    expect(bucketAuditDays(rows, NEW_YORK, 5000).counts).toEqual({ "2026-09-05": 1 });
    expect(bucketAuditDays(rows, null, 5000).counts).toEqual({ "2026-09-06": 1 });
  });

  it("reports truncation when the query hit its ceiling", () => {
    const rows = Array.from({ length: 3 }, () => ({ created_at: "2026-09-06T14:00:00.000Z" }));

    expect(bucketAuditDays(rows, "UTC", 3).truncated).toBe(true);
    expect(bucketAuditDays(rows, "UTC", 4).truncated).toBe(false);
  });

  it("skips rows with no usable timestamp rather than inventing a day", () => {
    const result = bucketAuditDays(
      [
        { created_at: "2026-09-06T14:00:00.000Z" },
        { created_at: "not a date" },
        { created_at: null },
        {},
      ],
      "UTC",
      5000,
    );

    expect(result.counts).toEqual({ "2026-09-06": 1 });
    // `total` stays the row count, so truncation still reads honestly.
    expect(result.total).toBe(4);
  });

  it("has no days for an empty period", () => {
    expect(bucketAuditDays([], "UTC", 5000)).toEqual({ counts: {}, total: 0, truncated: false });
  });
});
