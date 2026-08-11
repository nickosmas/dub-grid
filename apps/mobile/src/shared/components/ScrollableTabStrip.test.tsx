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

beforeAll(async () => {
  ScrollableTabStrip = (await import("./ScrollableTabStrip")).ScrollableTabStrip;
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
