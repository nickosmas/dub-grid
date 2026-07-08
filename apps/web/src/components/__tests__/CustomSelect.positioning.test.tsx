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
        role={typeof props.role === "string" ? props.role : undefined}
        aria-label={typeof props["aria-label"] === "string" ? props["aria-label"] : undefined}
      >
        {props.children}
      </div>
    );
  },
}));

import CustomSelect from "@/components/CustomSelect";

describe("CustomSelect positioning", () => {
  beforeEach(() => {
    popoverContentSpy.mockClear();
  });

  it("caps the popup height to the available viewport space", async () => {
    const user = userEvent.setup();

    render(
      <CustomSelect
        value="two"
        options={[
          { value: "one", label: "One" },
          { value: "two", label: "Two" },
          { value: "three", label: "Three" },
        ]}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /two/i }));

    expect(popoverContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "bottom",
        align: "start",
        positionMethod: "fixed",
        style: expect.objectContaining({
          maxHeight: "min(420px, var(--available-height, calc(100vh - 24px)))",
          overscrollBehavior: "contain",
        }),
      }),
    );
  });
});
