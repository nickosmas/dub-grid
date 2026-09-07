import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityTable, type ActivityTableEntry } from "@/components/activity/ActivityTable";
import { ActivityDetailsDialog } from "@/components/activity/ActivityLogParts";
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
    for (const name of ["Time", "Activity type", "Performed by", "Target changed"]) {
      expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument();
    }
    expect(within(table).queryByRole("columnheader", { name: "Organization" })).toBeNull();
  });

  it("drops the target column for a person's own page", () => {
    renderTable([entry({ id: "a" })], { showTarget: false });

    expect(screen.queryByRole("columnheader", { name: "Target changed" })).toBeNull();
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
    expect(screen.getByLabelText("2 events")).toHaveTextContent("2");
    expect(screen.getByText("Wednesday, September 2, 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("1 event")).toHaveTextContent("1");
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

  it("repeats the actor under the description for narrow screens", () => {
    renderTable([entry({ id: "a" })]);

    expect(screen.getByText(/Performed by Alex Admin/)).toHaveClass("md:hidden");
  });
});

describe("ActivityDetailsDialog", () => {
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
    expect(screen.queryByText("Organization")).toBeNull();
    unmount();

    render(<ActivityDetailsDialog entry={entry({ id: "a" })} onClose={vi.fn()} showOrganization />);
    expect(screen.getByText("Organization")).toBeInTheDocument();
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
