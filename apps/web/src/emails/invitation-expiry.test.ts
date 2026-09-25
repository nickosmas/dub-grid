import { describe, expect, it } from "vitest";
import { formatInvitationExpiry } from "./invitation-expiry";

describe("formatInvitationExpiry", () => {
  it("writes the deadline in the organization's zone, naming the zone", () => {
    expect(formatInvitationExpiry("2026-09-28T22:04:00.000Z", "America/Los_Angeles")).toBe(
      "Monday, September 28, 2026 at 3:04 PM Pacific Daylight Time",
    );
  });

  it("follows the zone across a daylight-saving change", () => {
    // Clocks go back on 1 November 2026 in Los Angeles.
    expect(formatInvitationExpiry("2026-11-02T22:04:00.000Z", "America/Los_Angeles")).toBe(
      "Monday, November 2, 2026 at 2:04 PM Pacific Standard Time",
    );
  });

  it("uses UTC for the default zone, an empty one or an unknown one", () => {
    const utc = "Monday, September 28, 2026 at 10:04 PM Coordinated Universal Time";
    expect(formatInvitationExpiry("2026-09-28T22:04:00.000Z", "UTC")).toBe(utc);
    expect(formatInvitationExpiry("2026-09-28T22:04:00.000Z", null)).toBe(utc);
    expect(formatInvitationExpiry("2026-09-28T22:04:00.000Z", "  ")).toBe(utc);
    expect(formatInvitationExpiry("2026-09-28T22:04:00.000Z", "Mars/Olympus_Mons")).toBe(utc);
  });

  it("gives no deadline for a missing or unreadable date", () => {
    expect(formatInvitationExpiry(null, "UTC")).toBeNull();
    expect(formatInvitationExpiry(undefined, "UTC")).toBeNull();
    expect(formatInvitationExpiry("not a date", "UTC")).toBeNull();
  });
});
