import { describe, expect, it } from "vitest";
import { US_STATES } from "@/lib/us-states";
import {
  US_STATE_DEFAULT_TIMEZONE,
  getTimezoneForUsState,
} from "@/lib/us-state-timezones";

const VALID_TZ = (() => {
  if (typeof Intl.supportedValuesOf !== "function") return null;
  return new Set(Intl.supportedValuesOf("timeZone"));
})();

describe("US_STATE_DEFAULT_TIMEZONE", () => {
  it("covers every US state and territory option", () => {
    for (const { value } of US_STATES) {
      expect(US_STATE_DEFAULT_TIMEZONE[value], `missing tz for ${value}`).toBeTypeOf("string");
    }
  });

  it("only maps to IANA zones that the runtime recognizes", () => {
    if (!VALID_TZ) return;
    for (const [state, tz] of Object.entries(US_STATE_DEFAULT_TIMEZONE)) {
      expect(VALID_TZ.has(tz), `${state} -> ${tz} is not a valid IANA zone`).toBe(true);
    }
  });
});

describe("getTimezoneForUsState", () => {
  it("returns the mapped zone for a known state code", () => {
    expect(getTimezoneForUsState("CA")).toBe("America/Los_Angeles");
    expect(getTimezoneForUsState("ca")).toBe("America/Los_Angeles");
    expect(getTimezoneForUsState("  TX  ")).toBe("America/Chicago");
  });

  it("returns null for unknown or empty input", () => {
    expect(getTimezoneForUsState("")).toBeNull();
    expect(getTimezoneForUsState(null)).toBeNull();
    expect(getTimezoneForUsState("ZZ")).toBeNull();
  });
});
