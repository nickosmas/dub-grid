import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const popoverContentSpy = vi.fn();

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: PropsWithChildren) => children,
  PopoverContent: (props: PropsWithChildren<Record<string, unknown>>) => {
    popoverContentSpy(props);

    return (
      <div
        role="dialog"
        aria-label={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
      >
        {props.children}
      </div>
    );
  },
}));

import { PresetColorPicker } from "@/components/settings/shared";

describe("PresetColorPicker positioning", () => {
  beforeEach(() => {
    popoverContentSpy.mockClear();
  });

  it("prefers opening to the right and relies on side flipping as the fallback", async () => {
    const user = userEvent.setup();

    render(<PresetColorPicker valueBg="#DBEAFE" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /color preset:/i }));

    expect(popoverContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "right",
        align: "start",
        sideOffset: 8,
        collisionPadding: 12,
        positionMethod: "fixed",
        collisionAvoidance: expect.objectContaining({
          side: "flip",
          align: "shift",
          fallbackAxisSide: "none",
        }),
      }),
    );
  });
});
