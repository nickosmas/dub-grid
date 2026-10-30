import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestsTab } from "./RequestsTab";
import type { PersonRequestRow } from "@/lib/person-requests";

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
const RANGE = { startDate: "2026-01-01", endDate: "2026-03-31" };

function renderTab(rows: PersonRequestRow[] | undefined = [SWAP, PICKUP], loading = false) {
  return render(
    <RequestsTab
      rows={rows}
      loading={loading}
      error={null}
      range={RANGE}
      periodPhrase="this quarter"
    />,
  );
}

describe("RequestsTab", () => {
  it("lists requests sent in the period, with a way to review what's waiting", () => {
    renderTab([SWAP, PICKUP, { ...PICKUP, key: "old", sentDate: "2025-12-30" }]);

    expect(screen.getByText("2 requests sent this quarter")).toBeInTheDocument();
    expect(screen.getByText("Swap · Sat, Mar 7 · Day Shift")).toBeInTheDocument();
    expect(screen.getByText("Waiting on you")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/schedule?requests=approval",
    );
    expect(screen.getByText("Approved by Nic Kosmas")).toBeInTheDocument();
  });

  it("filters from a dropdown, not segmented buttons", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Filter requests" }));
    fireEvent.click(screen.getByRole("option", { name: "Decided or closed" }));

    expect(screen.queryByText("Swap · Sat, Mar 7 · Day Shift")).toBeNull();
    expect(screen.getByText("Pickup · Fri, Jan 9 · Night Shift")).toBeInTheDocument();
  });

  it("shows the dashed empty state when nothing was sent", () => {
    renderTab([]);
    expect(screen.getByText("No requests sent this quarter")).toBeInTheDocument();
  });
});
