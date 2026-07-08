import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTimezoneOptions, formatTimezoneLabel, getSupportedTimezones } from "@/lib/timezones";

const originalSupportedValuesOf = Intl.supportedValuesOf;

describe("timezones", () => {
  afterEach(() => {
    Object.defineProperty(Intl, "supportedValuesOf", {
      value: originalSupportedValuesOf,
      configurable: true,
      writable: true,
    });
  });

  it("pins the saved timezone first and the detected timezone second", () => {
    vi.spyOn(Intl, "supportedValuesOf").mockReturnValue([
      "Europe/London",
      "America/Los_Angeles",
      "America/New_York",
    ]);

    const options = buildTimezoneOptions({
      selectedTimeZone: "America/New_York",
      detectedTimeZone: "America/Los_Angeles",
      date: new Date("2026-01-15T12:00:00Z"),
    });

    expect(options[0]?.value).toBe("America/New_York");
    expect(options[0]?.label).toContain("Saved");
    expect(options[1]?.value).toBe("America/Los_Angeles");
    expect(options[1]?.label).toContain("Local");
  });

  it("builds rich labels with UTC offsets and human-friendly place names", () => {
    const label = formatTimezoneLabel("America/Los_Angeles", new Date("2026-01-15T12:00:00Z"));

    expect(label).toContain("UTC");
    expect(label).toContain("Los Angeles");
  });

  it("falls back to the curated timezone list when Intl.supportedValuesOf is unavailable", () => {
    Object.defineProperty(Intl, "supportedValuesOf", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const values = getSupportedTimezones();
    expect(values).toContain("America/New_York");
    expect(values).toContain("UTC");
  });
});
