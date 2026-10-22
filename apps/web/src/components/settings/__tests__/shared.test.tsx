import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PresetColorPicker } from "@/components/settings/shared";

describe("PresetColorPicker", () => {
  it("renders its palette in a portal so it can escape clipped cards", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div style={{ overflow: "hidden", width: 180, padding: 12 }}>
        <PresetColorPicker valueBg="#DBEAFE" onChange={vi.fn()} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /color preset:/i }));

    const dialog = await screen.findByRole("dialog", {
      name: "Choose color preset",
    });

    expect(container).not.toContainElement(dialog);
  });

  it("applies the selected preset and closes the palette", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PresetColorPicker valueBg="#DBEAFE" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /color preset:/i }));
    await user.click(screen.getByRole("button", { name: "Lilac" }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "lilac",
        name: "Lilac",
        bg: "#EDE9FE",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Choose color preset" })).not.toBeInTheDocument();
    });
  });

  it("renders circular swatches named once, by the hint rather than a native tooltip", async () => {
    const user = userEvent.setup();

    render(<PresetColorPicker valueBg="#DBEAFE" onChange={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Color preset: Powder" });
    expect(trigger).not.toHaveAttribute("title");
    expect(trigger).toHaveStyle({ borderRadius: "9999px" });

    await user.click(trigger);

    const lilac = await screen.findByRole("button", { name: "Lilac" });
    expect(lilac).not.toHaveAttribute("title");
    expect(lilac).toHaveStyle({ borderRadius: "9999px" });
  });
});
