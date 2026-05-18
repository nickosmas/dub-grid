import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createReactNativeModule } from "../../test/native";

vi.mock("react-native", async () =>
  createReactNativeModule(await import("react")),
);

vi.mock("@expo/vector-icons/Ionicons", () => ({
  default: () => null,
}));

let SearchBar: (typeof import("./SearchBar"))["SearchBar"];

beforeAll(async () => {
  SearchBar = (await import("./SearchBar")).SearchBar;
});

function ControlledSearchBar(props: {
  initial?: string;
  onChange?: (value: string) => void;
  onDebouncedChange?: (value: string) => void;
  debounceMs?: number;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <SearchBar
      debounceMs={props.debounceMs}
      onChangeText={(next) => {
        setValue(next);
        props.onChange?.(next);
      }}
      onDebouncedChange={props.onDebouncedChange}
      placeholder="Search"
      value={value}
    />
  );
}

describe("SearchBar", () => {
  it("calls onChangeText synchronously on every keystroke", () => {
    const onChange = vi.fn();
    render(<ControlledSearchBar onChange={onChange} />);

    const input = screen.getByPlaceholderText("Search");
    fireEvent.change(input, { target: { value: "an" } });

    expect(onChange).toHaveBeenLastCalledWith("an");
  });

  it("hides the clear button when the value is empty and shows it once typing starts", () => {
    render(<ControlledSearchBar />);

    expect(screen.queryByLabelText("Clear search")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "x" },
    });

    expect(screen.getByLabelText("Clear search")).toBeTruthy();
  });

  it("clears the value when the clear button is pressed", () => {
    render(<ControlledSearchBar initial="hello" />);

    fireEvent.click(screen.getByLabelText("Clear search"));

    expect(screen.queryByLabelText("Clear search")).toBeNull();
    expect(
      (screen.getByPlaceholderText("Search") as HTMLInputElement).value,
    ).toBe("");
  });

  it("debounces onDebouncedChange and only fires the final value", () => {
    vi.useFakeTimers();
    try {
      const onDebouncedChange = vi.fn();
      render(
        <ControlledSearchBar
          debounceMs={300}
          onDebouncedChange={onDebouncedChange}
        />,
      );

      const input = screen.getByPlaceholderText("Search");
      fireEvent.change(input, { target: { value: "a" } });
      fireEvent.change(input, { target: { value: "ab" } });
      fireEvent.change(input, { target: { value: "abc" } });

      // Drain the initial mount fire (empty string).
      act(() => {
        vi.advanceTimersByTime(0);
      });
      onDebouncedChange.mockClear();

      act(() => {
        vi.advanceTimersByTime(299);
      });
      expect(onDebouncedChange).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(onDebouncedChange).toHaveBeenCalledTimes(1);
      expect(onDebouncedChange).toHaveBeenCalledWith("abc");
    } finally {
      vi.useRealTimers();
    }
  });
});
