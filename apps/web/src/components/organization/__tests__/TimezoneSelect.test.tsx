import type { PropsWithChildren } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const popoverContentSpy = vi.fn();

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: PropsWithChildren) => children,
  PopoverContent: (props: PropsWithChildren<Record<string, unknown>>) => {
    popoverContentSpy(props);

    return <div>{props.children}</div>;
  },
}));

import TimezoneSelect from "@/components/organization/TimezoneSelect";

describe("TimezoneSelect", () => {
  beforeEach(() => {
    popoverContentSpy.mockClear();
  });

  it("keeps the popup viewport-capped and the list scrollable", async () => {
    const user = userEvent.setup();

    render(<TimezoneSelect value="America/Los_Angeles" onChange={vi.fn()} />);

    await user.click(
      screen.getByRole("button", {
        name: /utc-7 . los angeles \(america\)/i,
      }),
    );

    expect(popoverContentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        side: "bottom",
        align: "start",
        positionMethod: "fixed",
        style: expect.objectContaining({
          maxHeight: "min(420px, var(--available-height, calc(100vh - 24px)))",
        }),
      }),
    );

    expect(screen.getByRole("listbox", { name: /time zones/i })).toHaveStyle({
      minHeight: "0",
      overflowY: "auto",
      overscrollBehavior: "contain",
    });
  });
});
