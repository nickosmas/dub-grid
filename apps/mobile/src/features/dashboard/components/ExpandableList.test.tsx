import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

let ExpandableList: (typeof import("./ExpandableList"))["ExpandableList"];

beforeAll(async () => {
  ExpandableList = (await import("./ExpandableList")).ExpandableList;
});

type Item = { id: string; label: string };

const ITEMS: Item[] = Array.from({ length: 7 }, (_, index) => ({
  id: `item-${index}`,
  label: `Item ${index}`,
}));

describe("ExpandableList", () => {
  it("shows only the collapsed count by default, with a 'See all' action", () => {
    render(
      <ExpandableList
        title="All items"
        items={ITEMS}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );

    expect(screen.getByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
    expect(screen.getByText("Item 4")).toBeInTheDocument();
    expect(screen.queryByText("Item 5")).not.toBeInTheDocument();
    expect(screen.getByText("See all 7")).toBeInTheDocument();
  });

  it("opens a sheet with the full list when 'See all' is pressed", () => {
    render(
      <ExpandableList
        title="All items"
        items={ITEMS}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );

    fireEvent.click(screen.getByText("See all 7"));

    expect(screen.getAllByText("All items")).toHaveLength(1);
    expect(screen.getAllByText("Item 5")).toHaveLength(1);
    expect(screen.getAllByText("Item 6")).toHaveLength(1);
  });

  it("navigates via onSeeAll instead of opening the built-in sheet when provided", () => {
    const onSeeAll = vi.fn();
    render(
      <ExpandableList
        title="All items"
        items={ITEMS}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
        onSeeAll={onSeeAll}
      />,
    );

    fireEvent.click(screen.getByText("See all 7"));

    expect(onSeeAll).toHaveBeenCalledTimes(1);
    // The built-in sheet never mounts, so the full list (Item 5/6) stays hidden.
    expect(screen.queryByText("Item 5")).not.toBeInTheDocument();
  });

  it("omits the 'See all' action when everything already fits", () => {
    render(
      <ExpandableList
        title="All items"
        items={ITEMS.slice(0, 2)}
        keyExtractor={(item) => item.id}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );

    expect(screen.queryByText(/See all/)).not.toBeInTheDocument();
  });
});
