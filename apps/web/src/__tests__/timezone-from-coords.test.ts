import { describe, expect, it } from "vitest";
import { getTimezoneForCoords } from "@/lib/timezone-from-coords";

describe("getTimezoneForCoords", () => {
  it("resolves coordinates to an IANA timezone", () => {
    expect(getTimezoneForCoords(37.422, -122.0841)).toBe("America/Los_Angeles");
    expect(getTimezoneForCoords(40.7128, -74.006)).toBe("America/New_York");
  });

  it("is coordinate-precise within multi-zone states", () => {
    // El Paso, TX is Mountain time even though most of Texas is Central.
    expect(getTimezoneForCoords(31.7619, -106.485)).toBe("America/Denver");
    // Dallas, TX is Central.
    expect(getTimezoneForCoords(32.7767, -96.797)).toBe("America/Chicago");
  });

  it("returns null for missing or invalid input", () => {
    expect(getTimezoneForCoords(null, null)).toBeNull();
    expect(getTimezoneForCoords(undefined, undefined)).toBeNull();
    expect(getTimezoneForCoords(37.42, undefined)).toBeNull();
    expect(getTimezoneForCoords(NaN, NaN)).toBeNull();
    expect(getTimezoneForCoords(999, 999)).toBeNull();
  });
});
