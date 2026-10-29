import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequestsTab } from "./RequestsTab";
import type { PersonRequestRow } from "@/lib/person-requests";

const rows: PersonRequestRow[] = [
  {
    key: "a",
    type: "Swap",
    details: "Sun, Nov 8 · Evening Shift",
    secondary: "with Margaret Sullivan",
    sentDate: "2026-10-28",
    state: "Awaiting approval",
    tone: "warning",
    decidedBy: null,
    waiting: true,
  },
  {
    key: "b",
    type: "Pickup",
    details: "Mon, Oct 19 · Day Shift",
    secondary: null,
    sentDate: "2026-10-15",
    state: "Approved",
    tone: "success",
    decidedBy: "QA SuperAdmin",
    waiting: false,
  },
  {
    key: "c",
    type: "Call-off",
    details: "Fri, Aug 7",
    secondary: null,
    sentDate: "2026-08-06",
    state: "Rejected",
    tone: "danger",
    decidedBy: null,
    waiting: false,
  },
];

function renderTab() {
  render(
    <RequestsTab
      rows={rows}
      loading={false}
      error={null}
      range={{ startDate: "2026-10-01", endDate: "2026-10-31" }}
      periodPhrase="this month"
    />,
  );
}

describe("RequestsTab", () => {
  it("lists the requests sent in the period, with who decided", () => {
    renderTab();

    expect(screen.getByText("2 requests sent this month.")).toBeInTheDocument();
    const [, first, second] = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(first).getByText("with Margaret Sullivan")).toBeInTheDocument();
    expect(within(first).getByText("Awaiting approval")).toBeInTheDocument();
    expect(within(second).getByText("by QA SuperAdmin")).toBeInTheDocument();
    expect(screen.queryByText("Fri, Aug 7")).not.toBeInTheDocument();
  });

  it("filters to what is still awaiting approval", () => {
    renderTab();

    fireEvent.click(screen.getByRole("button", { name: "Filter by state" }));
    fireEvent.click(screen.getByRole("option", { name: "Awaiting approval" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
  });

  it("says why it can't show them", () => {
    render(
      <RequestsTab
        rows={undefined}
        loading={false}
        error="We couldn't load their requests right now."
        range={{ startDate: "2026-10-01", endDate: "2026-10-31" }}
        periodPhrase="this month"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load their requests");
  });
});
