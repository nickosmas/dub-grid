import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActivityLog from "@/components/settings/ActivityLog";
import { fetchAuditLogDayCounts, fetchGridmasterFullAuditLog } from "@/features/gridmaster/client";
import type { FullAuditLogEntry } from "@/types";

const replace = vi.fn();
let searchParams = new URLSearchParams("section=org-activity");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/settings",
  useSearchParams: () => searchParams,
}));

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterFullAuditLog: vi.fn(),
  fetchAuditLogDayCounts: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchGridmasterFullAuditLog);
const mockedCounts = vi.mocked(fetchAuditLogDayCounts);
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const NEW_YORK = "America/New_York";

function makeEntry(overrides: Partial<FullAuditLogEntry> = {}): FullAuditLogEntry {
  return {
    id: 1,
    orgId: ORG_ID,
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
    createdAt: "2026-09-04T14:00:00.000Z",
    ...overrides,
  };
}

function renderLog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ActivityLog orgId={ORG_ID} timeZone={NEW_YORK} />
    </QueryClientProvider>,
  );
}

describe("ActivityLog date navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams("section=org-activity");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // 11:00 PM Sep 5 in New York, already Sep 6 in UTC.
    vi.setSystemTime(new Date("2026-09-06T03:00:00.000Z"));
    mockedFetch.mockResolvedValue([makeEntry()]);
    // The default period holds the one entry the rows mock returns.
    mockedCounts.mockResolvedValue({
      counts: { "2026-09-04": 1 },
      total: 1,
      truncated: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks only for the current week, bounded by the organization's days", async () => {
    renderLog();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        startDate: "2026-08-30T04:00:00.000Z",
        endDate: "2026-09-06T03:59:59.999Z",
        limit: 200,
        offset: 0,
      }),
    );
  });

  it("reports the period as stat boxes and groups the rows by day", async () => {
    mockedFetch.mockResolvedValue([
      makeEntry({ id: 1, createdAt: "2026-09-04T14:00:00.000Z" }),
      makeEntry({ id: 2, createdAt: "2026-09-04T16:00:00.000Z", action: "employee.updated" }),
      makeEntry({ id: 3, createdAt: "2026-09-01T16:00:00.000Z" }),
    ]);

    mockedCounts.mockResolvedValue({
      counts: { "2026-09-04": 2, "2026-09-01": 1 },
      total: 3,
      truncated: false,
    });

    renderLog();

    expect(await screen.findByLabelText("Events: 3, this week")).toBeInTheDocument();
    expect(screen.getByLabelText("Days with activity: 2, 2 days")).toBeInTheDocument();
    expect(screen.getByLabelText("People involved: 1, 1 person")).toBeInTheDocument();
    expect(screen.getByLabelText("Most common: 2, Access & roles")).toBeInTheDocument();
  });

  it("honors a period named in the URL", async () => {
    searchParams = new URLSearchParams("section=org-activity&period=day&date=2026-08-24");

    renderLog();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: "2026-08-24T04:00:00.000Z",
        endDate: "2026-08-25T03:59:59.999Z",
      }),
    );
  });

  it("writes the period back to the URL when stepping, keeping other params", async () => {
    const user = userEvent.setup();
    renderLog();

    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Go to previous period" }));

    expect(replace).toHaveBeenCalledWith(
      "/settings?section=org-activity&period=week&date=2026-08-23",
      { scroll: false },
    );
  });

  it("offers a way back to real activity when the period is empty", async () => {
    mockedFetch.mockImplementation((options) =>
      Promise.resolve(
        options?.limit === 1 ? [makeEntry({ createdAt: "2026-08-24T18:00:00.000Z" })] : [],
      ),
    );

    renderLog();

    expect(await screen.findByText("No activity this week")).toBeInTheDocument();
    expect(mockedFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endDate: "2026-08-30T03:59:59.999Z", limit: 1 }),
    );
    expect(
      await screen.findByRole("button", { name: /Jump to the latest activity, Aug 24, 2026/ }),
    ).toBeInTheDocument();
    // Stepping back is the toolbar's job; the card does not repeat it.
    expect(screen.queryByRole("button", { name: /^Show / })).toBeNull();
  });

  it("reports a failure instead of showing the period as empty", async () => {
    mockedFetch.mockRejectedValue(new Error("You don't have access to this organization."));

    renderLog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You don't have access to this organization.",
    );
    expect(screen.queryByText("No activity this week")).toBeNull();
  });

  it("falls back to plain language when the failure is technical", async () => {
    mockedFetch.mockRejectedValue(new Error('relation "audit_log" does not exist'));

    renderLog();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load activity right now.",
    );
  });

  it("counts the whole period, not just the page that loaded", async () => {
    mockedFetch.mockResolvedValue([makeEntry({ id: 1, createdAt: "2026-09-04T14:00:00.000Z" })]);
    mockedCounts.mockResolvedValue({
      counts: { "2026-09-04": 140, "2026-09-01": 60 },
      total: 200,
      truncated: false,
    });

    renderLog();

    // The page holds one row; the period holds 200 across two days.
    expect(await screen.findByLabelText("Events: 200, this week")).toBeInTheDocument();
    expect(screen.getByLabelText("Days with activity: 2, 2 days")).toBeInTheDocument();
    expect(await screen.findByLabelText("140 events")).toBeInTheDocument();
    expect(mockedCounts).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        startDate: "2026-08-30T04:00:00.000Z",
        endDate: "2026-09-06T03:59:59.999Z",
        timeZone: NEW_YORK,
      }),
    );
  });

  it("counts the loaded rows instead when a search is narrowing them", async () => {
    const user = userEvent.setup();
    renderLog();

    await waitFor(() => expect(mockedCounts).toHaveBeenCalled());
    mockedCounts.mockClear();

    await user.type(screen.getByRole("textbox", { name: "Search activity" }), "sam");

    // The count endpoint cannot apply free-text search, so it is not asked.
    await waitFor(() => expect(screen.getByLabelText(/^Events: /)).toBeInTheDocument());
    expect(mockedCounts).not.toHaveBeenCalled();
  });
});
