import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GridmasterPersonSchedule } from "@/features/gridmaster/person-record";
import { fetchGridmasterStaffActivity } from "@/features/gridmaster/client";
import { PersonScheduleSection } from "./PersonScheduleSection";

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterStaffActivity: vi.fn(),
}));

const EMPTY: GridmasterPersonSchedule = {
  window: { from: "2026-08-30", to: "2026-11-22" },
  recurring: [],
  series: [],
  shifts: [],
  indicators: [],
  publishChanges: [],
  shiftRequests: [],
  profileChangeRequests: [],
  actors: {},
};

const FULL: GridmasterPersonSchedule = {
  ...EMPTY,
  recurring: [
    {
      id: "rec-1",
      dayOfWeek: 1,
      label: "D",
      effectiveFrom: "2026-01-05",
      effectiveUntil: null,
      archivedAt: null,
    },
  ],
  series: [
    {
      id: "series-1",
      label: "N",
      frequency: "weekly",
      daysOfWeek: [2],
      startDate: "2026-09-01",
      endDate: null,
      maxOccurrences: null,
      archivedAt: null,
    },
  ],
  shifts: [
    {
      date: "2026-10-01T12:00:00.000Z",
      published: "D",
      draft: "Vacation",
      customStart: null,
      customEnd: null,
      source: "recurring",
      updatedAt: null,
    },
  ],
  indicators: [{ date: "2026-10-01T12:00:00.000Z", name: "Charge", status: "published" }],
  publishChanges: [
    {
      publishedAt: "2026-09-15T10:00:00.000Z",
      date: "2026-09-16T12:00:00.000Z",
      kind: "modified",
      from: "D",
      to: "N",
      publishedBy: "admin-1",
    },
  ],
  shiftRequests: [
    {
      id: "req-1",
      type: "swap",
      status: "approved",
      side: "requester",
      partner: "Ada Lovelace",
      shiftDate: "2026-09-22T12:00:00.000Z",
      partnerShiftDate: "2026-09-23T12:00:00.000Z",
      adminNote: "Covered",
      settledBy: "admin-1",
      createdAt: "2026-09-20T09:00:00.000Z",
      resolvedAt: "2026-09-20T10:00:00.000Z",
    },
  ],
  profileChangeRequests: [
    {
      id: "pcr-1",
      type: "contact",
      status: "pending",
      requested: { phone: "555-0100" },
      note: null,
      resolverNote: null,
      resolvedBy: null,
      createdAt: "2026-09-21T09:00:00.000Z",
      resolvedAt: null,
    },
  ],
  actors: { "admin-1": "admin@calmhaven.test" },
};

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PersonScheduleSection employeeId="emp-1" />
    </QueryClientProvider>,
  );
}

function group(title: RegExp | string) {
  return screen.getByText(title).parentElement as HTMLElement;
}

describe("PersonScheduleSection", () => {
  beforeEach(() => {
    vi.mocked(fetchGridmasterStaffActivity).mockReset();
  });

  it("fetches nothing until it is opened", async () => {
    vi.mocked(fetchGridmasterStaffActivity).mockResolvedValue({ schedule: EMPTY });
    renderSection();

    expect(fetchGridmasterStaffActivity).not.toHaveBeenCalled();
    const toggle = screen.getByRole("button", { name: "Show schedule and requests" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);
    await waitFor(() => expect(fetchGridmasterStaffActivity).toHaveBeenCalledWith("emp-1"));
    expect(screen.getByRole("button", { name: "Hide schedule and requests" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("shows every group from the loaded schedule", async () => {
    vi.mocked(fetchGridmasterStaffActivity).mockResolvedValue({ schedule: FULL });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Show schedule and requests" }));

    await screen.findByText("Recurring schedule");
    expect(within(group("Recurring schedule")).getByText("Monday: D")).toBeInTheDocument();
    expect(within(group("Recurring schedule")).getByText("Weekly series: N")).toBeInTheDocument();

    const shifts = group(/^Shifts, /);
    expect(within(shifts).getByText(/D, draft changes it to Vacation/)).toBeInTheDocument();
    expect(within(shifts).getByText(/Schedule notes: Charge/)).toBeInTheDocument();
    expect(within(shifts).getByText(/from the recurring schedule/)).toBeInTheDocument();

    const changes = group("Publish changes, last 90 days");
    expect(within(changes).getByText(/D to N/)).toBeInTheDocument();
    expect(within(changes).getByText(/by admin@calmhaven.test/)).toBeInTheDocument();

    const requests = group("Shift requests");
    expect(within(requests).getByText("Approved")).toBeInTheDocument();
    expect(
      within(requests).getByText(/Swap they asked for, with Ada Lovelace/),
    ).toBeInTheDocument();
    expect(within(requests).getByText(/note: Covered/)).toBeInTheDocument();

    const profile = group("Profile change requests");
    expect(within(profile).getByText(/Contact: Phone 555-0100/)).toBeInTheDocument();
  });

  it("says so when a group is empty", async () => {
    vi.mocked(fetchGridmasterStaffActivity).mockResolvedValue({ schedule: EMPTY });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Show schedule and requests" }));

    expect(await screen.findByText("No recurring shifts or series.")).toBeInTheDocument();
    expect(screen.getByText("Nothing scheduled in this window.")).toBeInTheDocument();
    expect(screen.getByText("No published changes.")).toBeInTheDocument();
    expect(screen.getByText("No shift requests.")).toBeInTheDocument();
    expect(screen.getByText("No profile change requests.")).toBeInTheDocument();
  });

  it("shows the error and loads again on retry", async () => {
    vi.mocked(fetchGridmasterStaffActivity)
      .mockRejectedValueOnce(new Error("We couldn't load this schedule."))
      .mockResolvedValueOnce({ schedule: EMPTY });
    renderSection();
    fireEvent.click(screen.getByRole("button", { name: "Show schedule and requests" }));

    expect(await screen.findByText("We couldn't load this schedule.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No shift requests.")).toBeInTheDocument();
    expect(fetchGridmasterStaffActivity).toHaveBeenCalledTimes(2);
  });
});
