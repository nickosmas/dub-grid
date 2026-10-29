import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityTable, type ActivityTableEntry } from "@/components/activity/ActivityTable";
import { ActivityDetailsDialog, ActivityItemDialog } from "@/components/activity/ActivityLogParts";
import { groupActivityEntries, isActivityGroup } from "@/lib/audit/grouping";
import { describeShiftChange } from "@dubgrid/schedule-core";
import { groupByDay } from "@/lib/activity-log-utils";

const NEW_YORK = "America/New_York";

function entry(overrides: Partial<ActivityTableEntry> & { id: string }): ActivityTableEntry {
  return {
    orgId: "org-1",
    orgName: "Calm Haven",
    actorId: "admin-1",
    actorEmail: "alex@example.com",
    actorName: "Alex Admin",
    action: "role.changed",
    resourceType: "organization_membership",
    resourceId: "user-1",
    targetLabel: "Sam Rivera",
    targetEmail: "sam@example.com",
    details: { fromRole: "user", toRole: "admin" },
    createdAt: "2026-09-06T14:00:00.000Z",
    ...overrides,
  };
}

function renderTable(
  entries: ActivityTableEntry[],
  props: Partial<React.ComponentProps<typeof ActivityTable>> = {},
) {
  const onSelect = vi.fn();
  render(
    <ActivityTable
      groups={groupByDay(entries, { timeZone: NEW_YORK, todayDate: "2026-09-06" })}
      timeZone={NEW_YORK}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect };
}

describe("ActivityTable", () => {
  it("shows the columns the view asked for and hides the rest", () => {
    renderTable([entry({ id: "a" })]);

    const table = screen.getByRole("table");
    for (const name of ["Time", "Activity", "By", "Affected"]) {
      expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(within(table).queryByRole("columnheader", { name: "Organization" })).toBeNull();
    expect(table.closest("[data-settings-table-layout]")).toHaveAttribute(
      "data-settings-table-layout",
      "available",
    );
  });

  it("drops the target column for a person's own page", () => {
    renderTable([entry({ id: "a" })], { showTarget: false });

    expect(screen.queryByRole("columnheader", { name: "Affected" })).toBeNull();
  });

  it("adds an organization column for the platform-wide log", () => {
    renderTable([entry({ id: "a" })], { showOrganization: true });

    expect(screen.getByRole("columnheader", { name: "Organization" })).toBeInTheDocument();
  });

  it("heads each day with its label and event count", () => {
    renderTable([
      entry({ id: "a", createdAt: "2026-09-06T14:00:00.000Z" }),
      entry({ id: "b", createdAt: "2026-09-06T15:00:00.000Z" }),
      entry({ id: "c", createdAt: "2026-09-02T15:00:00.000Z" }),
    ]);

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
    expect(screen.getByText("Wednesday, September 2, 2026")).toBeInTheDocument();
    expect(screen.getByText("1 event")).toBeInTheDocument();
  });

  it("shows the clock time in the organization's zone", () => {
    renderTable([entry({ id: "a", createdAt: "2026-09-06T14:00:00.000Z" })]);

    expect(screen.getByText("10:00 AM")).toBeInTheDocument();
  });

  it("makes each row the control that opens its details", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderTable([entry({ id: "a" })]);

    const row = screen.getByRole("row", { name: /Open details/ });
    await user.click(row);
    expect(onSelect).toHaveBeenCalledTimes(1);

    row.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(2);

    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole("button", { name: "View details" })).toBeNull();
  });

  it("names the kind of change above the headline", () => {
    renderTable([entry({ id: "a" })]);

    const row = screen.getByRole("row", { name: /Open details/ });
    expect(within(row).getByText("Access & roles")).toHaveClass("dg-activity-kind");
    expect(within(row).getByText("Changed Sam Rivera's role to Admin")).toBeInTheDocument();
  });

  it("repeats the actor under the description for narrow screens", () => {
    renderTable([entry({ id: "a" })]);

    expect(screen.getByText(/By Alex Admin/)).toHaveClass("md:hidden");
  });
});

describe("ActivityDetailsDialog", () => {
  it("keeps a correction's reason beside its Before and After", () => {
    const day = {
      kind: "shift" as const,
      key: "1:10",
      shiftName: "Day Shift",
      jobName: "Supervisor",
      focusAreaName: null,
      start: "07:00",
      end: "15:00",
    };
    render(
      <ActivityDetailsDialog
        entry={entry({
          id: "a",
          action: "shift.corrected",
          resourceType: "shift",
          details: { reason: "Called off" },
          shiftChange: describeShiftChange(
            { items: [day] },
            { items: [{ ...day, start: "07:00", end: "11:00" }] },
            { date: "2026-09-05" },
          ),
        })}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Reason")).toBeInTheDocument();
    expect(screen.getByText("Called off")).toBeInTheDocument();
  });

  it("times the event in the organization's zone", () => {
    render(
      <ActivityDetailsDialog
        entry={entry({ id: "a", createdAt: "2026-09-06T14:00:00.000Z" })}
        onClose={vi.fn()}
        timeZone={NEW_YORK}
      />,
    );

    expect(screen.getByText("Sep 6, 2026, 10:00 AM EDT")).toBeInTheDocument();
  });

  it("names the organization only when asked", () => {
    const { unmount } = render(
      <ActivityDetailsDialog entry={entry({ id: "a" })} onClose={vi.fn()} />,
    );
    expect(screen.queryByText("Calm Haven")).toBeNull();
    unmount();

    render(<ActivityDetailsDialog entry={entry({ id: "a" })} onClose={vi.fn()} showOrganization />);
    expect(screen.getByText("Calm Haven")).toBeInTheDocument();
  });

  it("calls a platform-level event platform-wide", () => {
    render(
      <ActivityDetailsDialog
        entry={entry({ id: "a", orgId: null, orgName: null })}
        onClose={vi.fn()}
        showOrganization
      />,
    );

    expect(screen.getByText("Platform-wide")).toBeInTheDocument();
  });
});

describe("grouped runs", () => {
  const run = ["Ana Torres", "Leo Grant", "Ana Torres"].map((name, index) =>
    entry({
      id: `run-${index}`,
      action: "shift.created",
      resourceType: "shift",
      resourceId: `employee-${index}:2026-11-0${index + 3}`,
      targetLabel: name,
      targetEmail: null,
      details: {},
      createdAt: `2026-09-06T14:0${3 - index}:00.000Z`,
    }),
  );

  it("shows a run of shift edits as one row with its counts", () => {
    const items = groupActivityEntries(run);
    render(
      <ActivityTable
        groups={groupByDay(items, { timeZone: NEW_YORK, todayDate: "2026-09-06" })}
        timeZone={NEW_YORK}
        onSelect={vi.fn()}
      />,
    );

    const row = screen.getByRole("row", { name: /Edited the draft for Nov 3 - Nov 5, 2026/ });
    const counts = [...row.querySelectorAll(".dg-activity-group-count")].map(
      (chip) => chip.textContent,
    );
    expect(counts).toEqual(["3 shifts", "2 people", "3 added"]);
    expect(within(row).getByText("10:01 - 10:03 AM")).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(1);
  });

  it("lists who a run touched, opening each to its changes", async () => {
    const user = userEvent.setup();
    const [group] = groupActivityEntries(run);
    if (!isActivityGroup(group)) throw new Error("expected a group");
    render(<ActivityItemDialog item={group} onClose={vi.fn()} timeZone={NEW_YORK} />);

    const ana = screen.getByRole("button", { name: /Ana Torres\s*2 shifts/ });
    expect(ana).toHaveAttribute("aria-expanded", "false");
    await user.click(ana);
    expect(ana).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText(/Added a shift on Nov/)).toHaveLength(2);
  });
});
