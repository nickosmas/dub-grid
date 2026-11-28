import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () => createReactNativeModule(await import("react")));
vi.mock("@expo/vector-icons/Ionicons", () => ({ default: () => null }));
vi.mock("../providers/ThemeModeProvider", () => ({
  useMobileColors: () => ({ brand: "#2563EB" }),
}));

import { PaneHeaderContext } from "./paneHeader";
import { PaneTitle } from "./PaneTitle";

describe("PaneTitle", () => {
  it("draws its own heading in a pane with no bar of its own", () => {
    render(<PaneTitle eyebrow="Pickup · Approved" title="QA Regular" />);

    expect(screen.getByText("QA Regular")).toBeInTheDocument();
    expect(screen.getByText("Pickup · Approved")).toBeInTheDocument();
  });

  it("hands its title to the pane's native bar and keeps only the eyebrow", () => {
    const setHeader = vi.fn();
    render(
      <PaneHeaderContext.Provider value={setHeader}>
        <PaneTitle eyebrow="Pickup · Approved" title="QA Regular" />
      </PaneHeaderContext.Provider>,
    );

    expect(setHeader).toHaveBeenCalledWith({ title: "QA Regular", large: undefined });
    expect(screen.queryByText("QA Regular")).not.toBeInTheDocument();
    expect(screen.getByText("Pickup · Approved")).toBeInTheDocument();
  });

  it("takes its title off the bar when the page leaves", () => {
    const setHeader = vi.fn();
    const { unmount } = render(
      <PaneHeaderContext.Provider value={setHeader}>
        <PaneTitle title="Notifications" />
      </PaneHeaderContext.Provider>,
    );

    unmount();

    expect(setHeader).toHaveBeenLastCalledWith(null);
  });
});
