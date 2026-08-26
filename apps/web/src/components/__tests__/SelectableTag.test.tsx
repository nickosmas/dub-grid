import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SelectableTag } from "@/components/ui/selectable-tag";

describe("SelectableTag", () => {
  it("uses pressed semantics and the filled selected treatment when active", () => {
    render(<SelectableTag selected>North</SelectableTag>);

    const button = screen.getByRole("button", { name: "North" });

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveStyle({
      background: "var(--dg-color-brand)",
      color: "var(--dg-color-text-inverse)",
      borderRadius: "999px",
    });
  });

  it("keeps the unselected treatment until the tag becomes active", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    const { rerender } = render(
      <SelectableTag selected={false} onClick={handleClick}>
        South
      </SelectableTag>,
    );

    const button = screen.getByRole("button", { name: "South" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveStyle({
      background: "var(--dg-color-surface)",
      color: "var(--dg-color-text-secondary)",
      borderRadius: "999px",
    });

    await user.click(button);
    expect(handleClick).toHaveBeenCalledOnce();

    rerender(<SelectableTag selected>South</SelectableTag>);
    expect(button).toHaveStyle({
      background: "var(--dg-color-brand)",
      color: "var(--dg-color-text-inverse)",
    });
  });
});
