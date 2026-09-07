import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTab } from "@/components/staff-detail/tabs/ActivityTab";
import { makeEmployee } from "@/__tests__/factories";
import type { EmployeeActivityEntry } from "@/types";

function entry(
  overrides: Partial<EmployeeActivityEntry> & { id: string; action: string },
): EmployeeActivityEntry {
  return {
    orgId: "org-1",
    orgName: "Calm Haven",
    actorId: "admin-1",
    actorEmail: "alex@example.com",
    actorName: "Alex Admin",
    resourceType: "organization_membership",
    resourceId: "user-1",
    targetLabel: "Sam Rivera",
    targetEmail: "sam@example.com",
    details: {},
    createdAt: "2026-01-03T10:00:00.000Z",
    ...overrides,
  };
}

const ROLE_CHANGE = entry({
  id: "role-change-1",
  action: "role.changed",
  details: { fromRole: "user", toRole: "admin" },
});

const INVITATION = entry({
  id: "invitation-sent-1",
  action: "invitation.sent",
  resourceType: "invitation",
  resourceId: "inv-1",
  actorId: null,
  actorName: null,
  actorEmail: null,
  details: { email: "sam@example.com", role: "user" },
  createdAt: "2026-01-02T10:00:00.000Z",
});

function renderTab(props: Partial<React.ComponentProps<typeof ActivityTab>> = {}) {
  return render(
    <ActivityTab
      employee={makeEmployee({ firstName: "Sam", lastName: "Rivera" })}
      entries={[ROLE_CHANGE, INVITATION]}
      loading={false}
      error={null}
      timeZone="UTC"
      {...props}
    />,
  );
}

describe("ActivityTab", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the person's timeline in the shared activity table", () => {
    renderTab();

    const table = screen.getByRole("table");
    for (const name of ["Time", "Activity type", "Performed by", "Activity and changes"]) {
      expect(within(table).getByRole("columnheader", { name })).toBeInTheDocument();
    }
    // The target is always this person, so naming it in every row is noise.
    expect(within(table).queryByRole("columnheader", { name: "Target changed" })).toBeNull();

    expect(screen.getByText("Changed Sam Rivera's role to Admin")).toBeInTheDocument();
    expect(screen.getByText(/User → Admin/)).toBeInTheDocument();
    expect(screen.getByText("Invited sam@example.com as User")).toBeInTheDocument();
    expect(screen.getByText("Alex Admin")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
    expect(screen.getByLabelText(/Events: 2/)).toBeInTheDocument();
  });

  it("opens the details dialog from a row, with no per-row button", async () => {
    const user = userEvent.setup();
    renderTab();

    const rows = screen.getAllByRole("row", { name: /Open details/ });
    expect(rows).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "View details" })).toBeNull();

    await user.click(rows[0]);
    expect(screen.getByRole("dialog", { name: "Activity details" })).toBeInTheDocument();
  });

  it("opens on the month holding the latest event, not an empty current month", () => {
    renderTab({
      entries: [
        entry({ id: "feb", action: "employee.updated", createdAt: "2026-02-10T10:00:00.000Z" }),
        ROLE_CHANGE,
        INVITATION,
      ],
    });

    // "Today" is March 1 in these tests, and March holds nothing.
    expect(screen.getByText("February 2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/Events: 1/)).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(1);
  });

  it("steps through months with the period navigator", async () => {
    const user = userEvent.setup();
    renderTab({
      entries: [
        entry({ id: "feb", action: "employee.updated", createdAt: "2026-02-10T10:00:00.000Z" }),
        ROLE_CHANGE,
        INVITATION,
      ],
    });

    await user.click(screen.getByRole("button", { name: "Go to previous period" }));

    expect(screen.getByText("January 2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/Events: 2/)).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(2);
  });

  it("offers a way out of an empty period instead of a dead end", async () => {
    const user = userEvent.setup();
    renderTab();

    // January holds both entries, so December is empty.
    await user.click(screen.getByRole("button", { name: "Go to previous period" }));
    expect(screen.getByText("No activity in December 2025")).toBeInTheDocument();

    const jump = screen.getByRole("button", { name: /Jump to the earliest activity/ });
    await user.click(jump);

    expect(screen.getByLabelText(/Events: 2/)).toBeInTheDocument();
  });

  it("switches the period length", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "Day" }));

    // The label and the day heading both name the day in Day view.
    expect(screen.getAllByText("Saturday, January 3, 2026").length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Events: 1/)).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(1);
  });

  it("groups a month's events by day", () => {
    renderTab();

    expect(screen.getByText("Saturday, January 3, 2026")).toBeInTheDocument();
    expect(screen.getByText("Friday, January 2, 2026")).toBeInTheDocument();
    expect(screen.getByLabelText(/Days with activity: 2/)).toBeInTheDocument();
  });

  it("shows an empty state that names the person instead of a bare table", () => {
    renderTab({ entries: [] });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText(/Changes to Sam Rivera's profile/)).toBeInTheDocument();
  });

  it("shows a skeleton while loading and the message when loading fails", () => {
    const { rerender } = render(
      <ActivityTab
        employee={makeEmployee({ firstName: "Sam", lastName: "Rivera" })}
        entries={[]}
        loading
        error={null}
        timeZone="UTC"
      />,
    );
    expect(screen.getByLabelText("Loading activity")).toBeInTheDocument();
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();

    rerender(
      <ActivityTab
        employee={makeEmployee({ firstName: "Sam", lastName: "Rivera" })}
        entries={[]}
        loading={false}
        error="We couldn't load activity right now."
        timeZone="UTC"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load activity right now.");
  });

  it("files an event under the organization's day, not the reader's", () => {
    // 10:30 PM on Jan 5 in New York, already Jan 6 in UTC.
    const lateEntry = entry({
      id: "late",
      action: "role.changed",
      createdAt: "2026-01-06T03:30:00.000Z",
    });

    const { unmount } = render(
      <ActivityTab
        employee={makeEmployee()}
        entries={[lateEntry]}
        loading={false}
        error={null}
        timeZone="America/New_York"
      />,
    );
    expect(screen.getByText("Monday, January 5, 2026")).toBeInTheDocument();
    unmount();

    render(
      <ActivityTab
        employee={makeEmployee()}
        entries={[lateEntry]}
        loading={false}
        error={null}
        timeZone="UTC"
      />,
    );
    expect(screen.getByText("Tuesday, January 6, 2026")).toBeInTheDocument();
  });

  it("filters the period by search text", async () => {
    const user = userEvent.setup();
    renderTab();

    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(2);

    await user.type(screen.getByRole("textbox", { name: "Search activity" }), "invit");

    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(1);
    expect(screen.getByText("Invited sam@example.com as User")).toBeInTheDocument();
  });

  it("says when filters hide everything, and clears them", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.type(screen.getByRole("textbox", { name: "Search activity" }), "nothing matches");

    expect(screen.getByText("No matching activity")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getAllByRole("row", { name: /Open details/ })).toHaveLength(2);
  });

  it("offers only the categories a person's activity can contain", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "Filter by activity type" }));

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "All activity",
      "People",
      "Access & roles",
      "Invitations",
    ]);
  });
});
