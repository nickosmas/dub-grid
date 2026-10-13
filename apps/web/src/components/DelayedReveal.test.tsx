import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedReveal } from "./DelayedReveal";

describe("DelayedReveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders nothing until the delay passes, then its children", () => {
    render(
      <DelayedReveal afterMs={400}>
        <p>Loading</p>
      </DelayedReveal>,
    );
    act(() => vi.advanceTimersByTime(399));
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("never mounts its children when it unmounts before the delay", () => {
    const mounted = vi.fn();
    function Child() {
      mounted();
      return null;
    }
    const { unmount } = render(
      <DelayedReveal afterMs={400}>
        <Child />
      </DelayedReveal>,
    );
    act(() => vi.advanceTimersByTime(200));
    unmount();
    act(() => vi.advanceTimersByTime(1000));
    expect(mounted).not.toHaveBeenCalled();
  });
});
