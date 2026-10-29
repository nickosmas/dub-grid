import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PersonActivityTimeline } from "@/components/activity/PersonActivityTimeline";
import { PERSON_ACTIVITY_CATEGORIES } from "@/lib/audit/registry";
import type { EmployeeActivityEntry } from "@/types";

function entry(id: string, createdAt: string, targetLabel: string): EmployeeActivityEntry {
  return {
    id,
    orgId: "org-1",
    actorId: "admin-1",
    actorEmail: "alex@example.com",
    actorName: "Alex Admin",
    action: "employee.updated",
    resourceType: "employee",
    resourceId: "emp-1",
    targetLabel,
    details: {},
    createdAt,
  } as EmployeeActivityEntry;
}

const ENTRIES = [
  entry("late", "2026-10-20T15:00:00.000Z", "October change"),
  entry("early", "2026-09-02T15:00:00.000Z", "September change"),
];

function renderTimeline(range?: { startDate: string; endDate: string; phrase: string }) {
  return render(
    <PersonActivityTimeline
      entries={ENTRIES}
      loading={false}
      error={null}
      timeZone="UTC"
      categories={PERSON_ACTIVITY_CATEGORIES}
      emptyDescription="Nothing yet."
      range={range}
    />,
  );
}

describe("PersonActivityTimeline", () => {
  it("keeps its own period navigation without a range", () => {
    renderTimeline();
    expect(screen.getByRole("button", { name: "Go to previous period" })).toBeInTheDocument();
  });

  it("shows only the given range, and leaves out its own navigation", () => {
    renderTimeline({ startDate: "2026-10-18", endDate: "2026-10-31", phrase: "this pay period" });

    expect(screen.queryByRole("button", { name: "Go to previous period" })).toBeNull();
    expect(screen.getAllByText("this pay period").length).toBeGreaterThan(0);
    // Only October's change is inside the range, so one row names its author.
    expect(within(screen.getByRole("table")).getAllByText("Alex Admin")).toHaveLength(1);
  });

  it("says nothing happened in an empty range, with no jump it can't make", () => {
    renderTimeline({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      phrase: "between Aug 1 and Aug 31",
    });

    expect(screen.getByText("No activity between Aug 1 and Aug 31")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /previous activity|earliest activity/ }),
    ).toBeNull();
  });
});
