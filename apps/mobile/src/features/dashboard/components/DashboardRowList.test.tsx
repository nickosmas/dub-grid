import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let DashboardRowList: (typeof import("./DashboardRowList"))["DashboardRowList"];
let DASHBOARD_CARD_PREVIEW_LIMIT: (typeof import("./DashboardRowList"))["DASHBOARD_CARD_PREVIEW_LIMIT"];
let hasMoreDashboardRows: (typeof import("./DashboardRowList"))["hasMoreDashboardRows"];

beforeAll(async () => {
  ({ DashboardRowList, DASHBOARD_CARD_PREVIEW_LIMIT, hasMoreDashboardRows } =
    await import("./DashboardRowList"));
});

type Item = { id: string; label: string };

const ITEMS: Item[] = Array.from({ length: 7 }, (_, index) => ({
  id: `item-${index}`,
  label: `Item ${index}`,
}));

describe("DashboardRowList", () => {
  it("caps the rows at the limit and draws no See all of its own", () => {
    render(
      <DashboardRowList
        items={ITEMS}
        keyExtractor={(item) => item.id}
        limit={3}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );

    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.queryByText("Item 3")).not.toBeInTheDocument();
    // The link lives in the card header now, where a reader looks for it.
    expect(screen.queryByText(/See all/)).not.toBeInTheDocument();
  });

  it("renders every row when no limit is given", () => {
    render(
      <DashboardRowList
        items={ITEMS}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );

    expect(screen.getByText("Item 6")).toBeInTheDocument();
  });
});

describe("hasMoreDashboardRows", () => {
  it("is true only when a card holds rows back from its preview", () => {
    expect(hasMoreDashboardRows(0)).toBe(false);
    expect(hasMoreDashboardRows(DASHBOARD_CARD_PREVIEW_LIMIT)).toBe(false);
    expect(hasMoreDashboardRows(DASHBOARD_CARD_PREVIEW_LIMIT + 1)).toBe(true);
  });
});
