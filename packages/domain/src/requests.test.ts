import { describe, expect, it } from "vitest";
import { formatShiftRequestStatusLabel } from "./requests";

describe("formatShiftRequestStatusLabel", () => {
  it("maps every known status to copy", () => {
    expect(formatShiftRequestStatusLabel("open")).toBe("Open");
    expect(formatShiftRequestStatusLabel("pending_approval")).toBe("Awaiting approval");
    expect(formatShiftRequestStatusLabel("approved")).toBe("Approved");
    expect(formatShiftRequestStatusLabel("rejected")).toBe("Rejected");
    expect(formatShiftRequestStatusLabel("cancelled")).toBe("Cancelled");
    expect(formatShiftRequestStatusLabel("expired")).toBe("Expired");
  });

  it("never shows a raw token", () => {
    expect(formatShiftRequestStatusLabel("awaiting_partner")).toBe("Awaiting partner");
    expect(formatShiftRequestStatusLabel(null)).toBe("Unknown");
    expect(formatShiftRequestStatusLabel("")).toBe("Unknown");
  });
});
