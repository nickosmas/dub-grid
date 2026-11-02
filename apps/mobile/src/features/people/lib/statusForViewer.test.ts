import { describe, expect, it } from "vitest";
import { statusForViewer } from "./statusForViewer";

const base = {
  status: "active" as const,
  plannedStatus: null,
  plannedFrom: null,
  plannedUntil: null,
  suspendedAt: null,
  suspendedUntil: null,
  firstDay: null,
};

describe("statusForViewer", () => {
  it("shows everything to someone who can change statuses", () => {
    const suspended = { ...base, suspendedAt: "2026-11-01T00:00:00Z" };
    expect(statusForViewer(suspended, true)).toBe(suspended);
  });

  it("shows someone away, without any other plan", () => {
    expect(
      statusForViewer(
        {
          ...base,
          status: "inactive" as const,
          plannedStatus: "removed" as const,
          plannedFrom: "2026-12-01",
        },
        false,
      ),
    ).toMatchObject({ status: "inactive", plannedStatus: null, plannedFrom: null });
  });

  it("shows a planned away, but not a first day", () => {
    expect(
      statusForViewer(
        {
          ...base,
          plannedStatus: "away" as const,
          plannedFrom: "2026-11-10",
          firstDay: "2026-11-03",
        },
        false,
      ),
    ).toMatchObject({ plannedStatus: "away", plannedFrom: "2026-11-10", firstDay: null });
  });

  it("shows nothing for Active, suspended, leaving, offboarded or a first day", () => {
    expect(statusForViewer(base, false)).toBeNull();
    expect(statusForViewer({ ...base, suspendedAt: "2026-11-01T00:00:00Z" }, false)).toBeNull();
    expect(
      statusForViewer(
        { ...base, plannedStatus: "removed" as const, plannedFrom: "2026-11-09" },
        false,
      ),
    ).toBeNull();
    expect(statusForViewer({ ...base, status: "removed" as const }, false)).toBeNull();
    expect(statusForViewer({ ...base, firstDay: "2026-11-10" }, false)).toBeNull();
  });
});
