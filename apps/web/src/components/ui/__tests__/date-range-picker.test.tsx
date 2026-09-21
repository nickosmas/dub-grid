import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DateRangePicker, { formatDateRangeLabel } from "@/components/ui/date-range-picker";

describe("DateRangePicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits a range only through Apply, as two taps from the first date", async () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        label="Shift dates"
        onChange={onChange}
        value={{ from: "2026-05-01", to: "2026-05-03" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Shift dates" }));
    fireEvent.click(await screen.findByRole("button", { name: /Monday, May 4th, 2026/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Friday, May 8th, 2026/ }));
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ from: "2026-05-04", to: "2026-05-08" });
  });

  it("holds Apply until both ends are chosen and something changed", async () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        label="Shift dates"
        onChange={onChange}
        value={{ from: "2026-05-04", to: "2026-05-08" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Shift dates" }));
    expect(await screen.findByRole("button", { name: "Apply" })).toBeDisabled();

    fireEvent.click(await screen.findByRole("button", { name: /Monday, May 4th, 2026/ }));
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  });

  it("clears at once when allowed, and never when not", async () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <DateRangePicker
        allowClear
        label="Shift dates"
        onChange={onChange}
        value={{ from: "2026-05-04", to: "2026-05-08" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Shift dates" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear" }));
    expect(onChange).toHaveBeenCalledWith({ from: "", to: "" });
    unmount();

    render(
      <DateRangePicker
        label="Shift dates"
        onChange={onChange}
        value={{ from: "2026-05-04", to: "2026-05-08" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Shift dates" }));
    expect(await screen.findByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("reads both ends the same way with the year said once", () => {
    expect(formatDateRangeLabel({ from: "2026-09-06", to: "2026-09-26" }, "Any")).toBe(
      "Sep 6 – Sep 26, 2026",
    );
    expect(formatDateRangeLabel({ from: "2026-09-06", to: "" }, "Any")).toBe("From Sep 6, 2026");
    expect(formatDateRangeLabel({ from: "", to: "" }, "Any")).toBe("Any");
  });
});
