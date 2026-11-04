import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useScrollToTopOnChange } from "./useScrollToTopOnChange";

vi.mock("../components/Screen", () => ({}));

describe("useScrollToTopOnChange", () => {
  it("scrolls to the top when the key changes, not on first render", () => {
    const scrollTo = vi.fn();
    const ref = { current: { scrollTo } as never };
    const { rerender } = renderHook(({ key }) => useScrollToTopOnChange(ref, key), {
      initialProps: { key: "2026-11-04" },
    });

    expect(scrollTo).not.toHaveBeenCalled();

    rerender({ key: "2026-11-04" });
    expect(scrollTo).not.toHaveBeenCalled();

    rerender({ key: "2026-10-28" });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: false });
  });
});
