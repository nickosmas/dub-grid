import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

const hapticSelection = vi.fn();

vi.mock("react-native", async () => createReactNativeModule(await import("react")));

vi.mock("../lib/haptics", () => ({
  hapticSelection: () => hapticSelection(),
  hapticImpact: vi.fn(),
  hapticNotify: vi.fn(),
}));

let ScrollableTabStrip: (typeof import("./ScrollableTabStrip"))["ScrollableTabStrip"];
let getTabScrollIntoViewOffset: (typeof import("./ScrollableTabStrip"))["getTabScrollIntoViewOffset"];
let getScreenGutter: (typeof import("./screen-layout"))["getScreenGutter"];

beforeAll(async () => {
  const scrollableTabStrip = await import("./ScrollableTabStrip");
  ScrollableTabStrip = scrollableTabStrip.ScrollableTabStrip;
  getTabScrollIntoViewOffset = scrollableTabStrip.getTabScrollIntoViewOffset;
  ({ getScreenGutter } = await import("./screen-layout"));
});

beforeEach(() => {
  hapticSelection.mockClear();
});

const TABS = [
  { key: "all", label: "All", count: 4 },
  { key: "pending", label: "Pending", count: 0 },
  { key: "approved", label: "Approved" },
] as const;

function renderStrip(overrides?: { activeKey?: string | null; onSelect?: (key: string) => void }) {
  return render(
    <ScrollableTabStrip
      activeKey={overrides?.activeKey === undefined ? "all" : overrides.activeKey}
      onSelect={overrides?.onSelect ?? vi.fn()}
      tabs={TABS}
    />,
  );
}

describe("ScrollableTabStrip", () => {
  it("renders every tab label", () => {
    renderStrip();

    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pending" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Approved" })).toBeInTheDocument();
  });

  it("keeps a long tab label to one line while retaining its full accessible name", () => {
    const label = "Journal Listed Christian Science Nurse";
    render(
      <ScrollableTabStrip activeKey="long" onSelect={vi.fn()} tabs={[{ key: "long", label }]} />,
    );

    expect(screen.getByRole("tab", { name: label })).toBeInTheDocument();
    expect(screen.getByText(label)).toHaveAttribute("data-number-of-lines", "1");
    expect(screen.getByText(label)).toHaveAttribute("data-ellipsize-mode", "tail");
  });

  // Requests used role="tab" while Schedule used role="button" with a "Select X"
  // label. One role, one naming convention, so assistive tech announces both
  // strips the same way.
  it("uses the tab role and the bare label as the accessible name", () => {
    renderStrip();

    expect(screen.queryByRole("button", { name: "Select All" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
  });

  it("marks only the active tab as selected", () => {
    renderStrip({ activeKey: "pending" });

    expect(screen.getByRole("tab", { name: "Pending" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
  });

  it("calls onSelect with the pressed tab's key", () => {
    const onSelect = vi.fn();
    renderStrip({ onSelect });

    fireEvent.click(screen.getByRole("tab", { name: "Approved" }));
    expect(onSelect).toHaveBeenCalledWith("approved");
    expect(hapticSelection).toHaveBeenCalledTimes(1);
  });

  it("ignores a press on the already-active tab", () => {
    const onSelect = vi.fn();
    renderStrip({ activeKey: "all", onSelect });

    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(hapticSelection).not.toHaveBeenCalled();
  });

  it("shows a count badge only for positive counts", () => {
    renderStrip();

    // "All" has 4; "Pending" has 0 and "Approved" has none at all.
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("renders nothing as active when activeKey is null", () => {
    renderStrip({ activeKey: null });

    for (const label of ["All", "Pending", "Approved"]) {
      expect(screen.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "false");
    }
  });

  it("survives an activeKey that matches no tab", () => {
    renderStrip({ activeKey: "does-not-exist" });

    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
  });
});

// Derived, not restated: the gutter is the screen's, which is per-platform
// because it has to line up with the navigation bar's title.
describe("getTabScrollIntoViewOffset", () => {
  const VIEWPORT_WIDTH = 390;

  it("leaves a fully visible tab alone", () => {
    expect(
      getTabScrollIntoViewOffset({
        scrollOffset: 0,
        tab: { x: 120, width: 100 },
        viewportWidth: VIEWPORT_WIDTH,
      }),
    ).toBeNull();
  });

  it("scrolls a right-clipped tab in, leaving the gutter beside it", () => {
    // Right edge at 500, so the strip has to sit at 500 + gutter - 390.
    expect(
      getTabScrollIntoViewOffset({
        scrollOffset: 0,
        tab: { x: 420, width: 80 },
        viewportWidth: VIEWPORT_WIDTH,
      }),
    ).toBe(500 + getScreenGutter() - VIEWPORT_WIDTH);
  });

  // The old math compared against 0 rather than the live scroll offset, so a
  // tab clipped by the left edge — tappable on its visible sliver, or made
  // active by something other than a tap — never scrolled back into view.
  it("scrolls a left-clipped tab back in", () => {
    expect(
      getTabScrollIntoViewOffset({
        scrollOffset: 300,
        tab: { x: 220, width: 80 },
        viewportWidth: VIEWPORT_WIDTH,
      }),
    ).toBe(220 - getScreenGutter());
  });

  it("never scrolls past the start of the strip for the first tab", () => {
    expect(
      getTabScrollIntoViewOffset({
        scrollOffset: 200,
        tab: { x: 16, width: 60 },
        viewportWidth: VIEWPORT_WIDTH,
      }),
    ).toBe(0);
  });

  it("leaves a visible tab alone even when the strip is scrolled", () => {
    expect(
      getTabScrollIntoViewOffset({
        scrollOffset: 300,
        tab: { x: 420, width: 80 },
        viewportWidth: VIEWPORT_WIDTH,
      }),
    ).toBeNull();
  });

  it("waits for the viewport to be measured", () => {
    expect(
      getTabScrollIntoViewOffset({
        scrollOffset: 0,
        tab: { x: 420, width: 80 },
        viewportWidth: 0,
      }),
    ).toBeNull();
  });
});
