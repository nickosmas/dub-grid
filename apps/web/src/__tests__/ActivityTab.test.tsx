import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityTab } from "@/components/staff-detail/tabs/ActivityTab";
import { makeEmployee } from "@/__tests__/factories";
import type { EmployeeActivityEntry } from "@/types";
import type { PersonRequestRow } from "@/lib/person-requests";

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

const SWAP: PersonRequestRow = {
  key: "shift-r1",
  type: "Swap",
  details: "Sat, Mar 7 · Day Shift",
  secondary: "with Margaret Sullivan",
  sentDate: "2026-02-20",
  state: "Awaiting approval",
  tone: "warning",
  decidedBy: null,
  waiting: true,
  reviewHref: "/schedule?requests=approval",
};
const PICKUP: PersonRequestRow = {
  ...SWAP,
  key: "shift-r2",
  type: "Pickup",
  details: "Fri, Jan 9 · Night Shift",
  secondary: null,
  sentDate: "2026-01-05",
  state: "Approved",
  tone: "success",
  decidedBy: "Nic Kosmas",
  waiting: false,
};

type Props = React.ComponentProps<typeof ActivityTab>;

function renderTab(props: Partial<Props> = {}) {
  return render(
    <ActivityTab
      employee={makeEmployee({ firstName: "Sam", lastName: "Rivera" })}
      range={RANGE}
      timeZone="UTC"
      requests={{ rows: [SWAP, PICKUP], loading: false, error: null }}
      changes={{ entries: [ROLE_CHANGE, INVITATION], loading: false, error: null }}
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

  it("lists their requests above the change log, with a way to review what's waiting", () => {
    renderTab();

    const requests = screen.getByRole("region", { name: "Requests" });
    expect(within(requests).getByText("Swap · Sat, Mar 7 · Day Shift")).toBeInTheDocument();
    expect(within(requests).getByText("Waiting on you")).toBeInTheDocument();
    expect(within(requests).getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/schedule?requests=approval",
    );
    expect(within(requests).getByText("Approved by Nic Kosmas")).toBeInTheDocument();

    const changes = screen.getByRole("region", { name: "Changes" });
    expect(within(changes).getByText("Changed Sam Rivera's role to Admin")).toBeInTheDocument();
    expect(within(changes).getByText("Invited sam@example.com as User")).toBeInTheDocument();
    // The page's period drives the log, so it has no navigator of its own.
    expect(screen.queryByRole("button", { name: "Go to previous period" })).toBeNull();
  });

  it("shows one list at a time from the filter", async () => {
    const user = userEvent.setup();
    renderTab();

    await user.click(screen.getByRole("button", { name: "Requests" }));
    expect(screen.getByRole("region", { name: "Requests" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Changes" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Changes" }));
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    expect(screen.getByRole("region", { name: "Changes" })).toBeInTheDocument();
  });

  it("drops the filter when the viewer can see only one list", () => {
    renderTab({ requests: null });

    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Requests" })).toBeNull();
    expect(screen.getByText("Changed Sam Rivera's role to Admin")).toBeInTheDocument();
  });

  it("counts only requests sent in the period", () => {
    renderTab({
      requests: {
        rows: [SWAP, { ...PICKUP, sentDate: "2025-12-30" }],
        loading: false,
        error: null,
      },
    });

    expect(screen.getByText("1 request sent this quarter")).toBeInTheDocument();
    expect(screen.queryByText(/Pickup/)).toBeNull();
  });

  it("shows an empty state that names the person instead of a bare table", () => {
    renderTab({ changes: { entries: [], loading: false, error: null } });

    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText(/Changes to Sam Rivera's profile/)).toBeInTheDocument();
  });

  it("says when either list fails to load", () => {
    renderTab({
      requests: { rows: undefined, loading: false, error: "We couldn't load their requests." },
      changes: { entries: [], loading: false, error: "We couldn't load activity right now." },
    });

    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual([
      "We couldn't load their requests.",
      "We couldn't load activity right now.",
    ]);
  });

  it("files an event under the organization's day, not the reader's", () => {
    // 10:30 PM on Jan 5 in New York, already Jan 6 in UTC.
    const lateEntry = entry({
      id: "late",
      action: "role.changed",
      createdAt: "2026-01-06T03:30:00.000Z",
    });

    const { unmount } = renderTab({
      requests: null,
      timeZone: "America/New_York",
      changes: { entries: [lateEntry], loading: false, error: null },
    });
    expect(screen.getByText("Monday, January 5, 2026")).toBeInTheDocument();
    unmount();

    renderTab({ requests: null, changes: { entries: [lateEntry], loading: false, error: null } });
    expect(screen.getByText("Tuesday, January 6, 2026")).toBeInTheDocument();
  });
});
