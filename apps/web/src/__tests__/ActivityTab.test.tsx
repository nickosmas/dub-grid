import { render, screen, within } from "@testing-library/react";
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

const RANGE = { startDate: "2026-01-01", endDate: "2026-03-31", phrase: "this quarter" };

type Props = React.ComponentProps<typeof ActivityTab>;

function renderTab(props: Partial<Props> = {}) {
  return render(
    <ActivityTab
      employee={makeEmployee({ firstName: "Sam", lastName: "Rivera" })}
      entries={[ROLE_CHANGE, INVITATION]}
      loading={false}
      error={null}
      timeZone="UTC"
      range={RANGE}
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

  it("shows the change log for the page's period, filtered from its own dropdown", () => {
    renderTab();

    expect(screen.getByText("Changed Sam Rivera's role to Admin")).toBeInTheDocument();
    expect(screen.getByText("Invited sam@example.com as User")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter by activity type" })).toBeInTheDocument();
    // No segmented filter and no navigator: the page's period drives the log.
    expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Go to previous period" })).toBeNull();
  });

  it("shows an empty state that names the person instead of a bare table", () => {
    renderTab({ entries: [] });

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText(/Changes to Sam Rivera's profile/)).toBeInTheDocument();
  });

  it("says when the log fails to load", () => {
    renderTab({ entries: [], error: "We couldn't load activity right now." });
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load activity right now.");
  });

  it("files an event under the organization's day, not the reader's", () => {
    // 10:30 PM on Jan 5 in New York, already Jan 6 in UTC.
    const lateEntry = entry({
      id: "late",
      action: "role.changed",
      createdAt: "2026-01-06T03:30:00.000Z",
    });

    const { unmount } = renderTab({ entries: [lateEntry], timeZone: "America/New_York" });
    expect(screen.getByText("Monday, January 5, 2026")).toBeInTheDocument();
    unmount();

    renderTab({ entries: [lateEntry] });
    expect(screen.getByText("Tuesday, January 6, 2026")).toBeInTheDocument();
  });
});
