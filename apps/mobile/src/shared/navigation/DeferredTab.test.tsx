import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFERRED_TAB_WARM_MS, DeferredTab } from "./DeferredTab";

let focused = false;

vi.mock("expo-router", () => ({ useIsFocused: () => focused }));
vi.mock("../providers/ThemeModeProvider", () => ({
  useMobileColors: () => ({ background: "#fff" }),
}));

describe("DeferredTab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    focused = false;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts a tab that opens focused straight away", () => {
    focused = true;
    render(<DeferredTab>tab content</DeferredTab>);
    expect(screen.getByText("tab content")).toBeInTheDocument();
  });

  it("holds an unvisited tab back, then mounts it once launch has settled", async () => {
    render(<DeferredTab>tab content</DeferredTab>);
    expect(screen.queryByText("tab content")).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFERRED_TAB_WARM_MS + 100);
    });
    expect(screen.getByText("tab content")).toBeInTheDocument();
  });

  it("mounts as soon as the tab is focused, and keeps it mounted after", () => {
    const view = render(<DeferredTab>tab content</DeferredTab>);
    expect(screen.queryByText("tab content")).toBeNull();

    focused = true;
    view.rerender(<DeferredTab>tab content</DeferredTab>);
    expect(screen.getByText("tab content")).toBeInTheDocument();

    focused = false;
    view.rerender(<DeferredTab>tab content</DeferredTab>);
    expect(screen.getByText("tab content")).toBeInTheDocument();
  });
});
