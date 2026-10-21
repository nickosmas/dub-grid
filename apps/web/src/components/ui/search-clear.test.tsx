import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { clearSearchOnEscape, SearchClearButton } from "./search-clear";

function SearchField({ onParentKeyDown }: { onParentKeyDown?: () => void }) {
  const [query, setQuery] = useState("");
  return (
    <div onKeyDown={onParentKeyDown}>
      <div className="relative">
        <input
          aria-label="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={clearSearchOnEscape(() => setQuery(""))}
        />
        {query && <SearchClearButton onClear={() => setQuery("")} />}
      </div>
    </div>
  );
}

describe("SearchClearButton", () => {
  it("clears the field and gives it focus back", () => {
    render(<SearchField />);
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "ana" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });
});

describe("clearSearchOnEscape", () => {
  it("clears a field with text and keeps Escape from reaching the surface around it", () => {
    const onParentKeyDown = vi.fn();
    render(<SearchField onParentKeyDown={onParentKeyDown} />);
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "ana" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("");
    expect(onParentKeyDown).not.toHaveBeenCalled();
  });

  it("lets Escape through when the field is already empty", () => {
    const onParentKeyDown = vi.fn();
    render(<SearchField onParentKeyDown={onParentKeyDown} />);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Search" }), { key: "Escape" });

    expect(onParentKeyDown).toHaveBeenCalledTimes(1);
  });
});
