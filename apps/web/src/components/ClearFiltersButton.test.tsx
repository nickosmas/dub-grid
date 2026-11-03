import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClearFiltersButton, clearFiltersLabel } from "./ClearFiltersButton";

describe("ClearFiltersButton", () => {
  it("names one filter in the singular and several in the plural", () => {
    expect(clearFiltersLabel(1)).toBe("Clear filter");
    expect(clearFiltersLabel(2)).toBe("Clear filters");
  });

  it("renders nothing when no filter is on", () => {
    const { container } = render(<ClearFiltersButton activeFilterCount={0} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("clears on click", () => {
    const onClear = vi.fn();
    render(<ClearFiltersButton activeFilterCount={3} onClear={onClear} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
