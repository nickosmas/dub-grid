import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./switch";

describe("Switch", () => {
  it("uses a contrast-safe semantic track when off", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} ariaLabel="Analytics cookies" />);

    const control = screen.getByRole("switch", { name: "Analytics cookies" });
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(control).toHaveStyle({ background: "var(--dg-color-switch-track-off)" });

    fireEvent.click(control);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("keeps the brand track when on", () => {
    render(<Switch checked onChange={() => {}} ariaLabel="Essential cookies" />);

    expect(screen.getByRole("switch", { name: "Essential cookies" })).toHaveStyle({
      background: "var(--dg-color-brand)",
    });
  });
});
