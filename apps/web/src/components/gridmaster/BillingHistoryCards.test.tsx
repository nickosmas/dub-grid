import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const fetchHistory = vi.fn();
const fetchSeats = vi.fn();

vi.mock("@/features/gridmaster/client", () => ({
  fetchGridmasterBillingHistory: () => fetchHistory(),
  fetchGridmasterOrgSeatHistory: (orgId: string) => fetchSeats(orgId),
}));

import { BillingHistoryCard, OrgSeatHistoryCard } from "./BillingHistoryCards";

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BillingHistoryCard", () => {
  it("says when history starts and shows each month, newest first", async () => {
    fetchHistory.mockResolvedValue({
      since: "2026-09-20T12:00:00.000Z",
      months: [
        {
          month: "2026-09",
          revenue: [{ currency: "usd", paidCents: 420000 }],
          failedInvoices: 0,
          billedSeats: 40,
        },
        { month: "2026-10", revenue: [], failedInvoices: 2, billedSeats: 42 },
      ],
    });

    wrap(<BillingHistoryCard />);

    expect(await screen.findByText(/^Since /)).toBeTruthy();
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("None")).toBeTruthy();
    expect(within(rows[0]).getByText("2")).toBeTruthy();
    expect(within(rows[0]).getByText("42")).toBeTruthy();
    expect(within(rows[1]).getByText(/4,200\.00/)).toBeTruthy();
  });

  it("says nothing has been recorded instead of showing empty months", async () => {
    fetchHistory.mockResolvedValue({ since: null, months: [] });

    wrap(<BillingHistoryCard />);

    expect(await screen.findByText("No history recorded yet.")).toBeTruthy();
    expect(screen.getByText("Seat changes and invoices are recorded from now on.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("OrgSeatHistoryCard", () => {
  it("lists seat changes with where each came from", async () => {
    fetchSeats.mockResolvedValue({
      seats: [
        {
          seats: 9,
          billable_app_users: 9,
          source: "gridmaster",
          recorded_at: "2026-10-01T00:00:00Z",
        },
        {
          seats: 7,
          billable_app_users: null,
          source: "backfill",
          recorded_at: "2026-09-01T00:00:00Z",
        },
      ],
    });

    wrap(<OrgSeatHistoryCard orgId="org-1" />);

    expect(await screen.findByText("Seat true-up")).toBeTruthy();
    expect(screen.getByText("Starting count")).toBeTruthy();
    expect(screen.getByText("Not counted")).toBeTruthy();
    expect(fetchSeats).toHaveBeenCalledWith("org-1");
  });

  it("says when an organization has no seat changes", async () => {
    fetchSeats.mockResolvedValue({ seats: [] });

    wrap(<OrgSeatHistoryCard orgId="org-1" />);

    expect(await screen.findByText("No seat changes recorded yet.")).toBeTruthy();
  });
});
