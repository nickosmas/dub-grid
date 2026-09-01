import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/account/client/api", () => ({
  fetchCalendarSubscriptionStatus: () => Promise.resolve({ active: false, issuedAt: null }),
}));

import { makeEmployee } from "@/__tests__/factories";
import { SelfWorkOverview } from "./SelfWorkProfile";

describe("SelfWorkOverview", () => {
  it("keeps calendar and recurring schedule cards in Overview without profile history", async () => {
    render(
      <SelfWorkOverview
        employee={makeEmployee()}
        focusAreas={[]}
        assignments={[]}
        shiftCategories={[]}
        certifications={[]}
        orgRoles={[]}
        shifts={{}}
        recurringShifts={[]}
      />,
    );

    expect(screen.getByText("Calendar subscription")).toBeInTheDocument();
    expect(screen.getByText("Recurring schedule")).toBeInTheDocument();
    expect(screen.queryByText("Shift history")).not.toBeInTheDocument();
    expect(screen.queryByText("Shift requests")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Create private link" })).toBeInTheDocument();
  });
});
