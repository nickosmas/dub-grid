import { describe, expect, it } from "vitest";
import { formatEmailDate, formatEmailDateTime, resolveEmailTimeZone } from "./email-time";

describe("email time formatting", () => {
  it("reads a moment in the organization's zone, naming the zone", () => {
    expect(formatEmailDateTime("2026-09-24T21:42:00.000Z", "America/Los_Angeles")).toBe(
      "September 24, 2026 at 2:42 PM PDT",
    );
    expect(formatEmailDateTime("2026-09-24T21:42:00.000Z", "Africa/Nairobi")).toBe(
      "September 25, 2026 at 12:42 AM GMT+3",
    );
  });

  it("falls back to UTC for a missing or unknown zone", () => {
    expect(resolveEmailTimeZone(null)).toBe("UTC");
    expect(resolveEmailTimeZone("  ")).toBe("UTC");
    expect(resolveEmailTimeZone("Not/AZone")).toBe("UTC");
    expect(formatEmailDateTime("2026-09-24T21:42:00.000Z", "Not/AZone")).toBe(
      "September 24, 2026 at 9:42 PM UTC",
    );
  });

  it("names the calendar day in the organization's zone, not the server's", () => {
    // 03:00 UTC is still the previous evening in Los Angeles.
    expect(formatEmailDate("2026-06-04T03:00:00.000Z", "America/Los_Angeles")).toBe("June 3, 2026");
    expect(formatEmailDate("2026-06-04T03:00:00.000Z", "UTC")).toBe("June 4, 2026");
  });

  it("returns an unreadable value unchanged", () => {
    expect(formatEmailDateTime("nope", "UTC")).toBe("nope");
    expect(formatEmailDate("nope", "UTC")).toBe("nope");
  });
});
